import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { simulationMarketplace } from "@/lib/marketplace/simulation-service";
import type { ReturnCondition } from "@/lib/marketplace/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { AlertTriangle, Check, Timer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/returns/$id/inspect")({
  component: ReturnInspectPage,
});

type LegacyCondition = "RESALABLE" | "DAMAGED" | "LOST";

type Allocation = {
  id: string;
  component_product_id: string;
  batch_id: string;
  products: { name: string; sku: string | null } | null;
  batches: { batch_number: string; expiry_date: string } | null;
};

type ReturnLine = {
  id: string;
  fulfillment_allocation_id: string;
  quantity: number;
  condition: ReturnCondition | null;
  inspected_at: string | null;
  fulfillment_allocations: Allocation | Allocation[] | null;
};

type ReturnRow = {
  id: string;
  return_date: string;
  condition: string;
  claim_deadline: string | null;
  claim_status: string;
  notes: string | null;
  external_reference: string | null;
  order: {
    id: string;
    order_number: string;
    status: string;
    channel: { code: string; name: string } | null;
    order_items: {
      product_id: string;
      quantity: number;
      batch_id: string | null;
      products: { name: string } | null;
    }[];
  } | null;
  return_lines: ReturnLine[];
};

const CONDITION_OPTIONS: Array<{
  value: ReturnCondition;
  legacyValue: LegacyCondition;
  title: string;
  desc: string;
}> = [
  {
    value: "resellable",
    legacyValue: "RESALABLE",
    title: "Layak jual",
    desc: "Masuk ke batch baru dengan origin = retur, bukan batch asal.",
  },
  {
    value: "damaged",
    legacyValue: "DAMAGED",
    title: "Rusak",
    desc: "Membuat claim/loss record tanpa pergerakan Stock Ledger kedua.",
  },
  {
    value: "lost_in_transit",
    legacyValue: "LOST",
    title: "Hilang di ekspedisi",
    desc: "Membuat claim/loss record tanpa pergerakan Stock Ledger kedua.",
  },
];

function createToken(prefix: string): string {
  const random =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

function conditionOption(condition: ReturnCondition) {
  return CONDITION_OPTIONS.find((option) => option.value === condition);
}

function conditionCode(condition: ReturnCondition | LegacyCondition): string {
  return condition === "lost_in_transit" ? "LOST_IN_TRANSIT" : condition.toUpperCase();
}

function allocationFor(line: ReturnLine): Allocation | null {
  const allocation = line.fulfillment_allocations;
  return Array.isArray(allocation) ? (allocation[0] ?? null) : allocation;
}

function ReturnInspectPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [row, setRow] = useState<ReturnRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [legacyCondition, setLegacyCondition] = useState<LegacyCondition>("RESALABLE");
  const [lineConditions, setLineConditions] = useState<Record<string, ReturnCondition>>({});
  const [selectedLines, setSelectedLines] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [inspectionKey, setInspectionKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitLock = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("returns")
      .select(
        `id, return_date, condition, claim_deadline, claim_status, notes, external_reference,
        order:order_id(id, order_number, status,
          channel:channel_id(code, name),
          order_items(product_id, quantity, batch_id, products:product_id(name))),
        return_lines(id, fulfillment_allocation_id, quantity, condition, inspected_at,
          fulfillment_allocations(id, component_product_id, batch_id,
            products:component_product_id(name, sku),
            batches:batch_id(batch_number, expiry_date)))`,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      setRow(null);
      setLoadError(error.message);
      setLoading(false);
      return;
    }

    const nextRow = data as unknown as ReturnRow | null;
    const normalizedRow = nextRow
      ? {
          ...nextRow,
          return_lines: Array.isArray(nextRow.return_lines) ? nextRow.return_lines : [],
        }
      : null;
    const lines = normalizedRow?.return_lines ?? [];
    setRow(normalizedRow);
    setNotes(normalizedRow?.notes ?? "");
    setLegacyCondition(
      normalizedRow?.condition === "DAMAGED" || normalizedRow?.condition === "LOST"
        ? normalizedRow.condition
        : "RESALABLE",
    );
    setLineConditions({});
    setSelectedLines(
      Object.fromEntries(lines.filter((line) => !line.condition).map((line) => [line.id, true])),
    );
    setInspectionKey(null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function setLineSelected(lineId: string, checked: boolean) {
    setSelectedLines((current) => ({ ...current, [lineId]: checked }));
    setInspectionKey(null);
  }

  function setLineCondition(lineId: string, value: ReturnCondition) {
    setLineConditions((current) => ({ ...current, [lineId]: value }));
    setSelectedLines((current) => ({ ...current, [lineId]: true }));
    setInspectionKey(null);
  }

  async function submitEventBacked(lines: ReturnLine[]) {
    if (!row?.external_reference) {
      toast.error("Retur event-backed tidak memiliki referensi event.");
      return;
    }

    const selected = lines.filter((line) => selectedLines[line.id]);
    if (selected.length === 0) {
      toast.error("Pilih minimal satu baris untuk diinspeksi.");
      return;
    }

    if (selected.some((line) => !lineConditions[line.id])) {
      toast.error("Tentukan kondisi untuk setiap baris yang dipilih.");
      return;
    }

    const idempotencyKey = inspectionKey ?? createToken("return.inspected");
    setInspectionKey(idempotencyKey);
    const inspectionLines = selected.map((line) => ({
      fulfillmentAllocationId: line.fulfillment_allocation_id,
      quantity: line.quantity,
      condition: lineConditions[line.id]!,
      notes: notes.trim() || undefined,
    }));

    const result = await simulationMarketplace.inspectReturn(
      row.external_reference,
      inspectionLines,
      {
        idempotencyKey,
      },
    );
    toast.success(
      result.status === "pending_inspection"
        ? "Sebagian inspeksi tersimpan. Baris lain tetap menunggu inspeksi."
        : "Semua baris retur sudah diinspeksi.",
    );
    navigate({ to: "/returns" });
  }

  async function submitLegacy() {
    const { error } = await supabase.rpc("process_return", {
      p_return_id: id,
      p_condition: legacyCondition,
      p_notes: notes.trim() || undefined,
    } as never);
    if (error) throw new Error(error.message);
    toast.success("Inspeksi retur tersimpan.");
    navigate({ to: "/returns" });
  }

  async function submit() {
    if (!row || busy || submitLock.current) return;
    if (row.return_lines.length === 0 && row.condition !== "PENDING_INSPECTION") {
      toast.error("Retur ini sudah diinspeksi.");
      return;
    }

    submitLock.current = true;
    setBusy(true);
    try {
      const pendingLines = row.return_lines.filter((line) => !line.condition);
      if (row.return_lines.length > 0) await submitEventBacked(pendingLines);
      else await submitLegacy();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  }

  if (loading) return <div className="text-sm text-muted-foreground">Memuat inspeksi retur…</div>;
  if (loadError)
    return (
      <Alert variant="destructive">
        <AlertTitle>Retur tidak dapat dimuat</AlertTitle>
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  if (!row) return <div className="text-sm text-muted-foreground">Retur tidak ditemukan.</div>;

  const eventBacked = row.return_lines.length > 0;
  const pendingLines = row.return_lines.filter((line) => !line.condition);
  const inspectedLines = row.return_lines.filter((line) => Boolean(line.condition));
  const daysLeft = row.claim_deadline
    ? Math.ceil((new Date(row.claim_deadline).getTime() - Date.now()) / 86400000)
    : null;
  const urgent = daysLeft !== null && daysLeft < 7;

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inspeksi Retur</h1>
        <p className="text-sm text-muted-foreground">
          Order {row.order?.order_number} · Channel {row.order?.channel?.name} · Retur diajukan{" "}
          {row.return_date}
        </p>
      </div>

      {row.claim_deadline && (
        <Alert variant={urgent ? "destructive" : "default"}>
          <Timer className="h-4 w-4" />
          <AlertTitle>Batas klaim ke Marketplace</AlertTitle>
          <AlertDescription>
            Ajukan klaim sebelum <b>{row.claim_deadline}</b> ({daysLeft} hari lagi). Status klaim:{" "}
            {row.claim_status}
          </AlertDescription>
        </Alert>
      )}

      {eventBacked ? (
        <EventBackedInspection
          row={row}
          pendingLines={pendingLines}
          inspectedLines={inspectedLines}
          selectedLines={selectedLines}
          lineConditions={lineConditions}
          onSelected={setLineSelected}
          onCondition={setLineCondition}
          notes={notes}
          onNotesChange={setNotes}
          busy={busy}
          onSubmit={submit}
          onCancel={() => navigate({ to: "/returns" })}
        />
      ) : (
        <LegacyInspection
          row={row}
          canSubmit={row.condition === "PENDING_INSPECTION"}
          condition={legacyCondition}
          onConditionChange={setLegacyCondition}
          notes={notes}
          onNotesChange={setNotes}
          busy={busy}
          onSubmit={submit}
          onCancel={() => navigate({ to: "/returns" })}
        />
      )}
    </div>
  );
}

function EventBackedInspection({
  row,
  pendingLines,
  inspectedLines,
  selectedLines,
  lineConditions,
  onSelected,
  onCondition,
  notes,
  onNotesChange,
  busy,
  onSubmit,
  onCancel,
}: {
  row: ReturnRow;
  pendingLines: ReturnLine[];
  inspectedLines: ReturnLine[];
  selectedLines: Record<string, boolean>;
  lineConditions: Record<string, ReturnCondition>;
  onSelected: (lineId: string, checked: boolean) => void;
  onCondition: (lineId: string, value: ReturnCondition) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  busy: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tentukan kondisi per baris retur</CardTitle>
        <p className="text-xs text-muted-foreground">
          {pendingLines.length > 0
            ? `${pendingLines.length} baris menunggu inspeksi${inspectedLines.length ? ` · ${inspectedLines.length} sudah selesai` : ""}. Pilih baris yang siap diproses.`
            : "Semua baris sudah diinspeksi."}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription className="text-xs">
            Satu pengiriman dapat berisi beberapa kondisi. Baris yang belum dipilih tetap pending
            dan dapat diinspeksi nanti.
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          {row.return_lines.map((line) => {
            const allocation = allocationFor(line);
            const inspected = Boolean(line.condition);
            const selected = selectedLines[line.id] ?? false;
            const productName = allocation?.products?.name ?? "Produk fulfillment";
            const condition = line.condition ? conditionOption(line.condition) : null;

            return (
              <div
                key={line.id}
                className={`rounded-lg border p-3 ${inspected ? "bg-muted/20" : ""}`}
              >
                <div className="flex items-start gap-3">
                  {inspected ? (
                    <div
                      className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-success/15 text-success-foreground"
                      aria-label="Sudah diinspeksi"
                    >
                      <Check className="h-3 w-3" />
                    </div>
                  ) : (
                    <Checkbox
                      id={`select-line-${line.id}`}
                      checked={selected}
                      onCheckedChange={(checked) => onSelected(line.id, checked === true)}
                      aria-label={`Pilih ${productName} untuk inspeksi`}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{productName}</p>
                      {inspected && condition && (
                        <Badge
                          variant="outline"
                          className="max-w-full gap-1 whitespace-normal text-left text-[11px]"
                          aria-label={`${conditionCode(line.condition!)}: ${condition.title}`}
                        >
                          <span className="font-mono text-[10px]">{conditionCode(line.condition!)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{condition.title}</span>
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {allocation?.products?.sku ? `SKU ${allocation.products.sku} · ` : ""}
                      {line.quantity} unit
                      {allocation?.batches?.batch_number
                        ? ` · Batch asal ${allocation.batches.batch_number}`
                        : ""}
                    </p>
                    <p
                      className="mt-1 font-mono text-[10px] text-muted-foreground/70"
                      title={line.fulfillment_allocation_id}
                    >
                      Alokasi {line.fulfillment_allocation_id.slice(0, 8)}…
                    </p>
                  </div>
                </div>

                {inspected ? (
                  <p className="ml-7 mt-2 text-xs text-muted-foreground">
                    Sudah diinspeksi
                    {line.inspected_at
                      ? ` pada ${new Date(line.inspected_at).toLocaleDateString("id-ID")}`
                      : ""}
                    . Baris tidak dapat diproses ulang.
                  </p>
                ) : selected ? (
                  <RadioGroup
                    value={lineConditions[line.id] ?? ""}
                    onValueChange={(value) => onCondition(line.id, value as ReturnCondition)}
                    className="ml-7 mt-3 grid gap-2 sm:grid-cols-3"
                    aria-label={`Kondisi ${productName}`}
                  >
                    {CONDITION_OPTIONS.map((option) => (
                      <Option
                        key={`${line.id}-${option.value}`}
                        id={`${line.id}-${option.value}`}
                        v={option.value}
                        title={option.title}
                        desc={option.desc}
                      />
                    ))}
                  </RadioGroup>
                ) : (
                  <p className="ml-7 mt-2 text-xs text-muted-foreground">
                    Baris ini tetap menunggu inspeksi.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="inspection-notes">Catatan inspeksi (opsional)</Label>
          <Textarea
            id="inspection-notes"
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            rows={3}
          />
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Batal
          </Button>
          <Button
            onClick={onSubmit}
            disabled={
              busy || pendingLines.length === 0 || !Object.values(selectedLines).some(Boolean)
            }
          >
            {busy ? "Menyimpan hasil inspeksi…" : "Simpan hasil inspeksi"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LegacyInspection({
  row,
  canSubmit,
  condition,
  onConditionChange,
  notes,
  onNotesChange,
  busy,
  onSubmit,
  onCancel,
}: {
  row: ReturnRow;
  canSubmit: boolean;
  condition: LegacyCondition;
  onConditionChange: (value: LegacyCondition) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  busy: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const selected =
    CONDITION_OPTIONS.find((option) => option.legacyValue === condition) ?? CONDITION_OPTIONS[0];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Item pesanan yang dikembalikan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {row.order?.order_items.map((item, index) => (
            <div key={`${item.product_id}-${index}`} className="flex justify-between border-b py-1">
              <span>{item.products?.name ?? item.product_id}</span>
              <span className="tabular-nums">{item.quantity}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tentukan kondisi barang retur</CardTitle>
          <p className="text-xs text-muted-foreground">
            Retur lama ini belum memiliki return_lines, jadi gunakan jalur kompatibilitas satu
            kondisi.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={condition}
            onValueChange={(value) => onConditionChange(value as LegacyCondition)}
            className="space-y-2"
            aria-label="Kondisi retur lama"
          >
            {CONDITION_OPTIONS.map((option) => (
              <Option
                key={option.legacyValue}
                id={`legacy-${option.legacyValue}`}
                v={option.legacyValue}
                title={option.title}
                desc={option.desc}
              />
            ))}
          </RadioGroup>

          <div className="space-y-1.5">
            <Label htmlFor="legacy-inspection-notes">Catatan inspeksi (opsional)</Label>
            <Textarea
              id="legacy-inspection-notes"
              value={notes}
              onChange={(event) => onNotesChange(event.target.value)}
              rows={3}
            />
          </div>

          {selected.legacyValue === "RESALABLE" ? (
            <Alert>
              <AlertDescription className="text-xs">
                Stok masuk ke batch BARU dengan origin = retur, bukan ke batch asal.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Tidak ada pergerakan Stock Ledger kedua. Stok sudah terpotong saat
                SHIPPED/IN_TRANSIT; claim/loss record akan tercatat.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onCancel} disabled={busy}>
              Batal
            </Button>
            <Button onClick={onSubmit} disabled={busy || !canSubmit}>
              {busy
                ? "Menyimpan hasil inspeksi…"
                : canSubmit
                  ? "Simpan hasil inspeksi"
                  : "Inspeksi sudah selesai"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function Option({ v, id, title, desc }: { v: string; id: string; title: string; desc: string }) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2 rounded-md border p-2.5 hover:bg-muted/40"
    >
      <RadioGroupItem value={v} id={id} className="mt-0.5" />
      <span className="min-w-0">
        <span className="block text-xs font-medium">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{desc}</span>
      </span>
    </label>
  );
}

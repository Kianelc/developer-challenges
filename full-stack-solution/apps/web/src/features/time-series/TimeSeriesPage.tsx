import { useEffect, useMemo, useState } from "react";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardHeader from "@mui/material/CardHeader";
import Grid from "@mui/material/Grid";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import DeleteSweepOutlinedIcon from "@mui/icons-material/DeleteSweepOutlined";
import UploadOutlinedIcon from "@mui/icons-material/UploadOutlined";
import type { CreateReadingsInput } from "@full-stack-solution/shared";
import { useAppDispatch, useAppSelector } from "@web/app/hooks";
import { ConfirmDialog } from "@web/components/common/ConfirmDialog";
import { EmptyState } from "@web/components/common/EmptyState";
import { ErrorAlert } from "@web/components/common/ErrorAlert";
import { PageHeader } from "@web/components/common/PageHeader";
import { StatCard } from "@web/components/common/StatCard";
import { fetchAllMonitoringPoints } from "@web/features/monitoring-points/monitoring-points.slice";
import { notify } from "@web/features/notifications/notifications.slice";
import { formatNumber, formatTimestamp } from "@web/utils/format";
import { IngestReadingsDialog } from "./IngestReadingsDialog";
import { ReadingsChart } from "./ReadingsChart";
import {
  deleteReadings,
  fetchStoredCount,
  fetchTimeSeries,
  ingestReadings,
  monitoringPointSelected,
  rangeChanged,
  timeSeriesErrorDismissed,
} from "./time-series.slice";

/** `datetime-local` inputs have no time zone; the API requires one. */
function toIsoWithZone(localValue: string): string | undefined {
  if (!localValue) {
    return undefined;
  }

  const date = new Date(localValue);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * Time-series workspace: ingest, visualize, measure and delete readings for a
 * single monitoring point.
 */
export function TimeSeriesPage() {
  const dispatch = useAppDispatch();
  const {
    selectedMonitoringPointId,
    readings,
    metrics,
    storedCount,
    status,
    isMutating,
    error,
    lastIngest,
  } = useAppSelector((state) => state.timeSeries);
  const monitoringPoints = useAppSelector((state) => state.monitoringPoints.all);

  const [ingestOpen, setIngestOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    void dispatch(fetchAllMonitoringPoints());
    void dispatch(fetchStoredCount());
  }, [dispatch]);

  // Pick the first point automatically so the page is never empty by accident.
  useEffect(() => {
    if (!selectedMonitoringPointId && monitoringPoints.length) {
      dispatch(monitoringPointSelected(monitoringPoints[0].id));
    }
  }, [dispatch, monitoringPoints, selectedMonitoringPointId]);

  useEffect(() => {
    if (selectedMonitoringPointId) {
      void dispatch(fetchTimeSeries());
    }
  }, [dispatch, selectedMonitoringPointId]);

  useEffect(() => {
    if (lastIngest) {
      const { received, inserted } = lastIngest;
      dispatch(
        notify(
          inserted === received
            ? `${inserted} readings stored`
            : `${inserted} of ${received} readings stored (duplicate timestamps skipped)`,
          inserted === received ? "success" : "warning",
        ),
      );
    }
  }, [dispatch, lastIngest]);

  const selectedPoint = useMemo(
    () =>
      monitoringPoints.find((point) => point.id === selectedMonitoringPointId) ??
      null,
    [monitoringPoints, selectedMonitoringPointId],
  );

  const applyRange = () => {
    dispatch(rangeChanged({ from: toIsoWithZone(from), to: toIsoWithZone(to) }));
    void dispatch(fetchTimeSeries());
  };

  const clearRange = () => {
    setFrom("");
    setTo("");
    dispatch(rangeChanged({}));
    void dispatch(fetchTimeSeries());
  };

  const handleIngest = async (input: CreateReadingsInput) => {
    if (!selectedMonitoringPointId) {
      return;
    }

    const result = await dispatch(
      ingestReadings({
        monitoringPointId: selectedMonitoringPointId,
        input,
      }),
    );

    if (result.meta.requestStatus === "fulfilled") {
      setIngestOpen(false);
    }
  };

  const handleDelete = async () => {
    const result = await dispatch(deleteReadings());

    if (result.meta.requestStatus === "fulfilled") {
      setDeleteOpen(false);
      const deleted = (result.payload as { deleted: number } | undefined)
        ?.deleted;
      dispatch(notify(`${deleted ?? 0} readings deleted`));
    }
  };

  if (!monitoringPoints.length) {
    return (
      <Stack spacing={3}>
        <PageHeader title="Time series" />
        <Card>
          <EmptyState
            title="No monitoring points"
            description="Create a machine and a monitoring point before sending readings."
          />
        </Card>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Time series"
        description="Store, inspect and delete the raw data collected by your sensors."
        action={
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button
              startIcon={<UploadOutlinedIcon />}
              variant="contained"
              onClick={() => setIngestOpen(true)}
              disabled={!selectedMonitoringPointId}
            >
              Send readings
            </Button>
            <Button
              startIcon={<DeleteSweepOutlinedIcon />}
              color="error"
              onClick={() => setDeleteOpen(true)}
              disabled={!selectedMonitoringPointId || readings.length === 0}
            >
              Delete
            </Button>
          </Stack>
        }
      />

      <ErrorAlert
        error={error}
        onDismiss={() => dispatch(timeSeriesErrorDismissed())}
        onRetry={() => void dispatch(fetchTimeSeries())}
      />

      <Card>
        <CardHeader
          title="Selection"
          subheader="Both range bounds are inclusive and optional."
        />
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <TextField
                select
                fullWidth
                label="Monitoring point"
                value={selectedMonitoringPointId ?? ""}
                onChange={(event) =>
                  dispatch(monitoringPointSelected(event.target.value))
                }
              >
                {monitoringPoints.map((point) => (
                  <MenuItem key={point.id} value={point.id}>
                    {point.machineName} · {point.name}
                    {point.sensorModel ? ` (${point.sensorModel})` : ""}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                label="From"
                type="datetime-local"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                label="To"
                type="datetime-local"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <Stack direction="row" spacing={1} sx={{ height: "100%" }}>
                <Button onClick={applyRange} variant="outlined" fullWidth>
                  Apply
                </Button>
                <Button onClick={clearRange} fullWidth>
                  Clear
                </Button>
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Readings in range"
            value={formatNumber(metrics?.count, 0)}
            loading={status === "loading"}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Minimum"
            value={formatNumber(metrics?.min)}
            loading={status === "loading"}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Maximum"
            value={formatNumber(metrics?.max)}
            loading={status === "loading"}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Average"
            value={formatNumber(metrics?.avg)}
            loading={status === "loading"}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <StatCard
            label="First reading"
            value={formatTimestamp(metrics?.firstTimestamp ?? null)}
            loading={status === "loading"}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <StatCard
            label="Readings stored (all points)"
            value={formatNumber(storedCount, 0)}
            caption={`Last reading in range: ${formatTimestamp(
              metrics?.lastTimestamp ?? null,
            )}`}
          />
        </Grid>
      </Grid>

      <Card>
        <CardHeader
          title={selectedPoint ? `${selectedPoint.name} — raw series` : "Raw series"}
          subheader={
            selectedPoint
              ? `${selectedPoint.machineName} (${selectedPoint.machineType})`
              : undefined
          }
        />
        {status === "loading" || isMutating ? <LinearProgress /> : null}
        <CardContent>
          {readings.length === 0 ? (
            <EmptyState
              title="No readings in this range"
              description="Send readings or widen the range to see the series."
            />
          ) : (
            <ReadingsChart readings={readings} />
          )}
        </CardContent>
      </Card>

      <IngestReadingsDialog
        open={ingestOpen}
        monitoringPointName={selectedPoint?.name}
        busy={isMutating}
        error={ingestOpen ? error : null}
        onSubmit={handleIngest}
        onClose={() => {
          setIngestOpen(false);
          dispatch(timeSeriesErrorDismissed());
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete readings"
        message={
          from || to
            ? "Every reading inside the selected range will be permanently deleted."
            : "No range is set, so every reading of this monitoring point will be permanently deleted."
        }
        confirmLabel="Delete readings"
        confirmColor="error"
        busy={isMutating}
        onConfirm={handleDelete}
        onClose={() => setDeleteOpen(false)}
      />
    </Stack>
  );
}

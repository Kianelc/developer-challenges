import { useEffect } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardHeader from "@mui/material/CardHeader";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import PrecisionManufacturingOutlinedIcon from "@mui/icons-material/PrecisionManufacturingOutlined";
import SensorsOutlinedIcon from "@mui/icons-material/SensorsOutlined";
import TimelineOutlinedIcon from "@mui/icons-material/TimelineOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import { Link as RouterLink } from "react-router-dom";
import { MIN_MONITORING_POINTS_PER_MACHINE } from "@full-stack-solution/shared";
import { useAppDispatch, useAppSelector } from "@web/app/hooks";
import { PageHeader } from "@web/components/common/PageHeader";
import { StatCard } from "@web/components/common/StatCard";
import {
  fetchMachines,
  selectMachinesBelowMinimumPoints,
} from "@web/features/machines/machines.slice";
import { fetchAllMonitoringPoints } from "@web/features/monitoring-points/monitoring-points.slice";
import { fetchStoredCount } from "@web/features/time-series/time-series.slice";
import { paths } from "@web/routes/paths";
import { formatNumber } from "@web/utils/format";

/** Landing page of the private area: counters and shortcuts. */
export function OverviewPage() {
  const dispatch = useAppDispatch();
  const machines = useAppSelector((state) => state.machines.items);
  const machinesStatus = useAppSelector((state) => state.machines.status);
  const monitoringPoints = useAppSelector((state) => state.monitoringPoints.all);
  const storedCount = useAppSelector((state) => state.timeSeries.storedCount);
  const belowMinimum = useAppSelector(selectMachinesBelowMinimumPoints);

  useEffect(() => {
    void dispatch(fetchMachines());
    void dispatch(fetchAllMonitoringPoints());
    void dispatch(fetchStoredCount());
  }, [dispatch]);

  const withoutSensor = monitoringPoints.filter(
    (point) => point.sensorId === null,
  ).length;

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Overview"
        description="Current state of your monitored assets."
      />

      {belowMinimum.length ? (
        <Alert
          severity="warning"
          icon={<WarningAmberOutlinedIcon />}
          action={
            <Button
              color="inherit"
              size="small"
              component={RouterLink}
              to={paths.machines}
            >
              Review
            </Button>
          }
        >
          <AlertTitle>
            {belowMinimum.length} machine(s) with fewer than{" "}
            {MIN_MONITORING_POINTS_PER_MACHINE} monitoring points
          </AlertTitle>
          {belowMinimum.map((machine) => machine.name).join(", ")}
        </Alert>
      ) : null}

      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Machines"
            value={machines.length}
            loading={machinesStatus === "loading"}
            icon={<PrecisionManufacturingOutlinedIcon />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Monitoring points"
            value={monitoringPoints.length}
            icon={<SensorsOutlinedIcon />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Points without sensor"
            value={withoutSensor}
            icon={<WarningAmberOutlinedIcon />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Readings stored"
            value={formatNumber(storedCount, 0)}
            icon={<TimelineOutlinedIcon />}
          />
        </Grid>
      </Grid>

      <Card>
        <CardHeader title="Next steps" />
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Button component={RouterLink} to={paths.machines} variant="outlined">
              Manage machines
            </Button>
            <Button
              component={RouterLink}
              to={paths.monitoringPoints}
              variant="outlined"
            >
              Manage monitoring points
            </Button>
            <Button
              component={RouterLink}
              to={paths.timeSeries}
              variant="outlined"
            >
              Inspect time series
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

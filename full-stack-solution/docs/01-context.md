# Context

## The product

DynaPredict is Dynamox's asset condition monitoring platform. Industrial equipment —
pumps, fans — is instrumented with sensors that sample a physical quantity
(vibration, temperature) over time. Maintenance teams read those series to spot
degradation *before* a machine fails, which is the difference between a scheduled
stop and an unplanned one.

This repository implements the slice of that platform that the challenge describes:
registering the asset hierarchy and storing, measuring and visualizing the raw
series collected from it.

## Who uses it

A single role: an authenticated maintenance/reliability user who owns the assets
they register. There is no administrator, no multi-role permission matrix and no
team sharing — see [Scope](./03-scope.md).

Data is **per user**: every machine, monitoring point, sensor and reading belongs to
the user who created it, and one user never sees another's. The mechanism is in
[Security](./08-security.md).

## The mental model

```
User
 └── Machine            (a physical asset: "Pump 01", type Pump or Fan)
      └── MonitoringPoint   (a place on that asset worth measuring: "Pump bearing")
           ├── Sensor         (the device installed there: id "A1B2", model HF+)
           └── Reading[]      (the time series: timestamp + value)
```

Two things in that model drive most of the design:

1. **A monitoring point is the unit of measurement, not the sensor.** Sensors are
   swapped in the field; the series must survive the swap. So readings hang off the
   monitoring point, and there is no separate "series" entity.
2. **Sensor models are not interchangeable.** A sensor model has physical limits, so
   some models cannot be installed on some machine types. That is the one genuine
   domain rule in the brief, and it is enforced in three places for three different
   reasons — see [Business Rules](./07-business-rules.md).

## Vocabulary

| Term | Meaning here |
|------|--------------|
| Machine | A physical asset. Type is `Pump` or `Fan`. |
| Monitoring point | A named location on a machine where a measurement is taken. |
| Sensor | The measuring device installed on a monitoring point. Model is `TcAg`, `TcAs` or `HF+`. Its id is chosen by the user and is globally unique. |
| Reading | One sample: an ISO 8601 timestamp with time zone, and a numeric value. |
| Time series | All readings of one monitoring point. Not a stored entity — a query. |
| Metrics | Aggregates over a series: count, min, max, average, first and last timestamp. |

## Origin

The requirements come from `../../full-stack-challenge.md`. That file is the
authority on *what* to build; these documents are the authority on *how* it was
built and *why*. Where the brief is ambiguous, the resolution is recorded in
[Assumptions](./12-assumptions.md).

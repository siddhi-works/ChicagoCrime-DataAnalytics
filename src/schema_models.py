"""Typed contracts for everything in export/. JSON Schemas and TypeScript types are generated from these."""
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


class Axis(BaseModel):
    field: str
    label: str
    type: Literal["quantitative", "ordinal", "nominal", "temporal"]


class SeriesSpec(BaseModel):
    field: str
    mark: Literal["bar", "line", "area", "point"]
    axis: Literal["left", "right"]


class ChartSpec(BaseModel):
    id: str
    handout_ref: Optional[str] = Field(None, description="K/Q number from the competition handout, if any")
    title: str
    subtitle: Optional[str] = None
    chart_type: Literal["line", "column", "bar", "donut", "combo", "heatmap", "scatter", "table", "area", "map"]
    x: Axis
    y: Axis
    series: Optional[list[SeriesSpec]] = None
    order: Optional[Any] = Field(None, description="Category order for ordinal axes (list) or {rows, columns} for heatmaps")
    row_field: Optional[str] = None
    note: Optional[str] = None
    window: Optional[str] = Field(None, description="Time window the data is restricted to, if any")
    scope: Literal["whole_dataset", "window_A", "window_B", "both_windows"] = "whole_dataset"
    filterable_via_cube: bool = Field(False, description="True if the chart can be recomputed from cube.json under filters")
    caveats: list[str] = []
    data: list[dict[str, Any]]


class KPI(BaseModel):
    id: str
    label: str
    value: float
    unit: str
    formula: str
    numerator: Optional[float] = None
    denominator: Optional[float] = None
    harmonised_value: Optional[float] = None
    sensitivity_value: Optional[float] = None
    sensitivity_note: Optional[str] = None
    note: Optional[str] = None


class Insight(BaseModel):
    id: str
    tier: Literal["headline", "supporting", "data_quality"]
    headline: str
    text: str
    evidence: dict[str, Any]
    method: str
    charts: list[str]
    caveat: Optional[str] = None


class ManifestEntry(BaseModel):
    id: str
    file: str
    kind: Literal["kpis", "chart", "cube", "geo", "insights", "meta"]
    title: str
    handout_ref: Optional[str] = None
    chart_type: Optional[str] = None
    scope: Optional[str] = None
    filterable_via_cube: bool = False
    rows: Optional[int] = None
    sha256: str


class Manifest(BaseModel):
    project: str
    generated_utc: str
    source: dict[str, Any]
    windows: dict[str, Any]
    entries: list[ManifestEntry]


class Cube(BaseModel):
    description: str
    dims: list[str]
    lookups: dict[str, Any]
    columns: dict[str, list[int]]
    rows: int
    total_crimes: int

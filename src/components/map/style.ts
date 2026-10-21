import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";
import type { Lang } from "@/lib/i18n";

/**
 * AMAN basemap: EOxCloudless Sentinel-2 imagery for the Earth/approach shots, fading into a calm,
 * warm vector city (OpenFreeMap / OpenMapTiles, © OpenStreetMap contributors) at street scale.
 * 3D buildings are drawn by the Three.js city layer, not by this style.
 */

export const PALETTE = {
  land: "#eef1ec",
  landWarm: "#f1efe8",
  water: "#a9d4d2",
  waterLine: "#8cc3c2",
  park: "#d7e6cb",
  roadCasing: "#d5ddd8",
  road: "#ffffff",
  roadMajor: "#fffaf0",
  motorway: "#fdf1d8",
  label: "#476168",
  labelHalo: "#f7f9f7",
  zoneFill: "#fa684f",
  zoneLine: "#e2553d",
  closure: "#d8402a",
};

const name = (lang: Lang): ExpressionSpecification => ["coalesce", ["get", `name:${lang}`], ["get", "name:latin"], ["get", "name"]];

const fadeIn = (z0: number, z1: number, v = 1): ExpressionSpecification => ["interpolate", ["linear"], ["zoom"], z0, 0, z1, v];

export function buildStyle(lang: Lang, origin: string): StyleSpecification {
  return {
    version: 8,
    name: "AMAN 360",
    projection: { type: "globe" },
    glyphs: `${origin}/api/tiles/fonts/{fontstack}/{range}.pbf`,
    sky: {
      "sky-color": "#bfe0e6",
      "horizon-color": "#eef4f1",
      "fog-color": "#e6eeec",
      "fog-ground-blend": 0.6,
      "horizon-fog-blend": 0.55,
      "sky-horizon-blend": 0.75,
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 8, 0.9, 11, 0.25, 13, 0],
    },
    light: { anchor: "map", position: [1.4, 230, 35], intensity: 0.4 },
    sources: {
      eox: {
        type: "raster",
        tiles: [`${origin}/api/tiles/eox/{z}/{y}/{x}.jpg`],
        tileSize: 256,
        maxzoom: 13,
        attribution:
          '<a href="https://cloudless.eox.at" target="_blank" rel="noopener">EOxCloudless</a> by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2024)',
      },
      ofm: {
        type: "vector",
        url: `${origin}/api/tiles/ofm/planet.json`,
        attribution:
          '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
      },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": PALETTE.land } },
      {
        id: "imagery",
        type: "raster",
        source: "eox",
        paint: {
          "raster-opacity": ["interpolate", ["linear"], ["zoom"], 0, 1, 10.5, 1, 12.6, 0],
          "raster-saturation": -0.12,
          "raster-contrast": 0.04,
          "raster-fade-duration": 250,
        },
      },
      {
        id: "landuse-residential",
        type: "fill",
        source: "ofm",
        "source-layer": "landuse",
        filter: ["in", ["get", "class"], ["literal", ["residential", "commercial", "retail"]]],
        paint: { "fill-color": PALETTE.landWarm, "fill-opacity": fadeIn(11.5, 13, 0.8) },
      },
      {
        id: "park",
        type: "fill",
        source: "ofm",
        "source-layer": "park",
        paint: { "fill-color": PALETTE.park, "fill-opacity": fadeIn(11, 12.5, 0.95) },
      },
      {
        id: "landcover-grass",
        type: "fill",
        source: "ofm",
        "source-layer": "landcover",
        filter: ["in", ["get", "class"], ["literal", ["grass", "wood", "farmland"]]],
        paint: { "fill-color": PALETTE.park, "fill-opacity": fadeIn(11, 12.5, 0.8) },
      },
      {
        id: "water",
        type: "fill",
        source: "ofm",
        "source-layer": "water",
        paint: { "fill-color": PALETTE.water, "fill-opacity": fadeIn(9.5, 11.5) },
      },
      {
        id: "water-edge",
        type: "line",
        source: "ofm",
        "source-layer": "water",
        paint: { "line-color": PALETTE.waterLine, "line-width": 1, "line-opacity": fadeIn(12, 14, 0.6) },
      },
      {
        id: "road-casing",
        type: "line",
        source: "ofm",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary", "secondary", "tertiary", "minor"]]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": PALETTE.roadCasing,
          "line-opacity": fadeIn(10.5, 12),
          "line-width": [
            "interpolate",
            ["exponential", 1.5],
            ["zoom"],
            11,
            ["match", ["get", "class"], ["motorway", "trunk"], 2.2, ["primary", "secondary"], 1.6, 0.6],
            17,
            ["match", ["get", "class"], ["motorway", "trunk"], 26, ["primary", "secondary"], 20, "tertiary", 15, 9],
          ],
        },
      },
      {
        id: "road",
        type: "line",
        source: "ofm",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service"]]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["match", ["get", "class"], ["motorway", "trunk"], PALETTE.motorway, ["primary", "secondary"], PALETTE.roadMajor, PALETTE.road],
          "line-opacity": fadeIn(10.5, 12),
          "line-width": [
            "interpolate",
            ["exponential", 1.5],
            ["zoom"],
            11,
            ["match", ["get", "class"], ["motorway", "trunk"], 1.4, ["primary", "secondary"], 1, 0.3],
            17,
            ["match", ["get", "class"], ["motorway", "trunk"], 22, ["primary", "secondary"], 17, "tertiary", 12, "service", 4, 7],
          ],
        },
      },
      {
        id: "boundary-country",
        type: "line",
        source: "ofm",
        "source-layer": "boundary",
        filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]],
        paint: { "line-color": "#ffffff", "line-width": 1, "line-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.55, 9, 0.2, 11, 0] },
      },
      {
        id: "road-label",
        type: "symbol",
        source: "ofm",
        "source-layer": "transportation_name",
        minzoom: 14.5,
        filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary", "secondary", "tertiary"]]],
        layout: {
          "symbol-placement": "line",
          "text-field": name(lang),
          "text-font": ["Noto Sans Regular"],
          "text-size": 11.5,
          "text-letter-spacing": lang === "ar" ? 0 : 0.02,
          "text-max-angle": 30,
        },
        paint: { "text-color": PALETTE.label, "text-halo-color": PALETTE.labelHalo, "text-halo-width": 1.6, "text-opacity": 0.85 },
      },
      {
        id: "water-label",
        type: "symbol",
        source: "ofm",
        "source-layer": "water_name",
        minzoom: 12,
        layout: { "text-field": name(lang), "text-font": ["Noto Sans Italic"], "text-size": 12.5 },
        paint: { "text-color": "#2f7d80", "text-halo-color": "rgba(255,255,255,0.7)", "text-halo-width": 1.2 },
      },
      {
        id: "place-label",
        type: "symbol",
        source: "ofm",
        "source-layer": "place",
        filter: ["in", ["get", "class"], ["literal", ["city", "town", "suburb", "neighbourhood", "country"]]],
        layout: {
          "text-field": name(lang),
          "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 3, ["match", ["get", "class"], "country", 13, 11], 10, ["match", ["get", "class"], "city", 17, 12], 15, ["match", ["get", "class"], ["suburb", "neighbourhood"], 13, 15]],
          "text-transform": lang === "ar" ? "none" : "uppercase",
          "text-letter-spacing": lang === "ar" ? 0 : 0.12,
          "text-max-width": 8,
        },
        paint: {
          "text-color": ["interpolate", ["linear"], ["zoom"], 8, "#ffffff", 11.5, "#3c5a61"],
          "text-halo-color": ["interpolate", ["linear"], ["zoom"], 8, "rgba(16,44,51,0.55)", 11.5, "rgba(247,249,247,0.9)"],
          "text-halo-width": 1.4,
          "text-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.9, 15.5, 0.9, 16.5, 0.0],
        },
      },
    ],
  };
}

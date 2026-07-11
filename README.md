# Adaptive Satellite Map for Foxglove

A Foxglove custom panel that renders an effectively unlimited raster-tile map and follows a UAV. It automatically chooses map zoom from camera AGL and FOV, offsets the viewport ahead of the aircraft, and lets the operator temporarily pan/zoom away from the vehicle.

## Important limitation

Foxglove extensions cannot inject a new renderer into the built-in **3D** panel. This extension therefore adds a separate panel named **Adaptive Satellite Map**. Put it next to the built-in 3D panel, or use it as the primary map/navigation panel.

## Default input topics

- `/input/gps`
  - `latitude`
  - `longitude`
  - `altitude`
- `/input/telemetry`
  - `agl_m`
  - `yaw_deg`

All topic names and field paths can be changed from the panel's **Settings** button.

## Zoom logic

The panel computes the approximate nadir camera footprint:

- width = `2 * AGL * tan(horizontalFov / 2)`
- height = `2 * AGL * tan(verticalFov / 2)`

It chooses Web Mercator zoom so that the footprint and forward look-ahead fit the current panel dimensions. At 600 m and 3000 m, the footprint occupies a similar fraction of the panel while MapLibre requests the appropriate surrounding tile pyramid.

## Install from source

```bash
npm install
npm run local-install
```

Restart Foxglove Desktop. Open **Add panel** and select **Adaptive Satellite Map**.

## Build a distributable `.foxe`

```bash
npm run package
```

Open or drag the resulting `.foxe` file into Foxglove.

## Usage

1. Open your MCAP.
2. Add **Adaptive Satellite Map** to the layout.
3. Press **Settings** and verify the GPS and telemetry topics.
4. Set the camera horizontal and vertical FOV.
5. Keep **Follow** and **Auto zoom** enabled.
6. Drag or zoom the map to browse ahead; this pauses follow/auto-zoom. Press **Follow** to return.

## Tile providers

The default raster layer is Esri World Imagery. You can replace it with any permitted XYZ/TMS URL using `{z}`, `{x}`, and `{y}` placeholders.

Do not paste unofficial Google Maps tile URLs. Google imagery requires the official Google Maps Tile API, billing, session-token handling, attribution, and compliance with Google's terms. In production, put an authorized provider behind your own tile gateway and configure its XYZ URL here.

## Direction conventions

The panel expects heading in degrees clockwise from north. If your `yaw_deg` is ENU mathematical yaw or has a constant offset, set **Heading offset** in the panel settings.

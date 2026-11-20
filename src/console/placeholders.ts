//! The Droidime screen as the design draws it.
//!
//! Nothing is wired to it yet: the device view is parked, so the screen shows the
//! design's own machines rather than nothing at all. One copy, imported by the console
//! and the preview both — when the device view is wired this file is what goes.

import { BatteryMedium, Cpu, MemoryStick } from 'lucide-react'
import type { Machine } from './Console'
import { sampleSeries } from './Console'

const WINDOW = 20

/* The phones DroidIME runs on: the same card, read as a device rather than a
   server. */
export const DROIDIME_DEVICES: Machine[] = [
  {
    id: 'pixel-8',
    name: 'Pixel 8',
    online: true,
    meta: 'tunnel live 2m ago',
    metrics: [
      { label: 'CPU', icon: Cpu, unit: '%', digits: 0, series: sampleSeries(31, 24, 12, WINDOW) },
      {
        label: 'RAM',
        icon: MemoryStick,
        unit: 'GB',
        digits: 1,
        total: '8',
        series: sampleSeries(53, 5.2, 0.3, WINDOW),
      },
      { label: 'BATTERY', icon: BatteryMedium, unit: '%', digits: 0, series: sampleSeries(88, 86, 2, WINDOW) },
    ],
  },
  {
    id: 'pixel-4a',
    name: 'Pixel 4a',
    online: false,
    meta: 'last seen 2d ago',
    metrics: [
      { label: 'CPU', icon: Cpu, unit: '%', digits: 0, series: [] },
      { label: 'RAM', icon: MemoryStick, unit: 'GB', digits: 1, total: '6', series: [] },
      { label: 'BATTERY', icon: BatteryMedium, unit: '%', digits: 0, series: [] },
    ],
  },
]

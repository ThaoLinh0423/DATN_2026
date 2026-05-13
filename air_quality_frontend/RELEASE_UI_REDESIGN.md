# UI Redesign Release — ClickHouse Dark Design System

**Date:** 2025-01  
**Scope:** Full UI overhaul — không thay đổi logic, API, hay business data

---

## Tổng quan

Toàn bộ giao diện được cập nhật theo design system lấy cảm hứng từ ClickHouse: nền đen thuần (`#000000`), accent neon volt (`#faff69`), border charcoal, typography Inter. **Màu sắc dữ liệu (pm1, pm2.5, pm10, AQI, nhiệt độ, độ ẩm) được giữ nguyên** để đảm bảo tính nhất quán trong hiển thị chart/gauge.

---

## Files đã thay đổi

| File | Thay đổi |
|------|----------|
| `src/index.css` | CSS variables toàn bộ → dark palette, font Inter + Inconsolata |
| `tailwind.config.ts` | Font family, border-radius sharp (4px/8px), shadow tokens, named colors |
| `src/App.tsx` | Loading screen → dark (`#000000` + neon spinner) |
| `src/components/layout/Sidebar.tsx` | Pure black sidebar, neon active state, uppercase navigation label |
| `src/components/layout/Header.tsx` | Dark header, charcoal border, neon role badge, hover → neon volt |
| `src/components/dashboard/constants.ts` | UI surface colors → dark; data colors giữ nguyên |
| `src/components/dashboard/KpiCard.tsx` | Near-black card, charcoal border, Inconsolata font cho số |
| `src/components/dashboard/ChartCard.tsx` | Near-black card, charcoal border header |
| `src/components/dashboard/AqiGauge.tsx` | Dark surface, Inconsolata số, uppercase label |
| `src/pages/LoginPage.tsx` | Black canvas, neon Volt CTA (Login), Forest Green CTA (Register), sharp corners |

---

## Design Tokens chính

| Token | Giá trị | Mục đích |
|-------|---------|----------|
| Page background | `#000000` | Canvas chính — pure black |
| Card/surface | `#141414` | Near-black — card, button bg |
| Card border | `rgba(65,65,65,0.8)` | Charcoal — tất cả card containment |
| Primary accent | `#faff69` | Neon Volt — CTA, active state, hover |
| Secondary CTA | `#166534` | Forest Green — Register button |
| Primary text | `#ffffff` | Pure white |
| Secondary text | `#a0a0a0` | Silver — label, muted |
| Active/pressed text | `#f4f692` | Pale Yellow |
| Border radius | `4px` (button/badge), `8px` (card) | Sharp geometry |
| Display font | Inter 400–700 | UI typography |
| Mono/number font | Inconsolata 600–700 | Số liệu, KPI, code |

---

## Data Colors (không thay đổi)

| Metric | Color |
|--------|-------|
| PM1.0 | `#7b2d8b` |
| PM2.5 | `#c4314b` |
| PM10 | `#d15b00` |
| AQI | `#0078d4` |
| Nhiệt độ | `#00875a` |
| Độ ẩm | `#b8860b` |

---

## Những gì KHÔNG thay đổi

- Toàn bộ logic xử lý dữ liệu
- API calls, hooks, WebSocket
- Cấu trúc routing
- Màu sắc data / chart
- Business logic tính AQI, forecast ML

---

## Hướng dẫn mở rộng

**Thêm component mới** → dùng inline style với các giá trị từ `C` trong `constants.ts`:
```ts
background: C.bg          // #141414
border: `1px solid ${C.border}`  // rgba(65,65,65,0.8)
color: C.text              // #ffffff
color: C.muted             // #a0a0a0
```

**Neon highlight** → border `1px solid #faff69`, bg `rgba(250,255,105,0.08)`

**Hover state** → color `#ffffff`, bg `rgba(255,255,255,0.05)`

**Active/pressed** → color `#f4f692`, box-shadow `rgba(0,0,0,0.14) 0px 4px 25px inset`

---

## Checklist QA

- [x] Login page: black canvas, neon CTA, green register button
- [x] Sidebar: pure black, neon active highlight, charcoal border
- [x] Header: dark bg, breadcrumb, neon admin badge
- [x] KPI Cards: near-black, charcoal border, top color bar, Inconsolata font
- [x] Chart Cards: near-black header/body, charcoal border
- [x] AQI Gauge: dark surface, uppercase label, Inconsolata number
- [x] Loading screen: black bg, neon spinner
- [x] Scrollbar: black track, charcoal thumb, neon hover
- [x] Select/input: dark bg override
- [x] Data colors unchanged: pm1, pm25, pm10, aqi, temp, hum

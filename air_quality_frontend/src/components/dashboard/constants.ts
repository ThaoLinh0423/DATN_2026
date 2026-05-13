// ─── Color palette ────────────────────────────────────────────────────────────
// Data colors: giữ nguyên các màu hiển thị dữ liệu cảm biến.
// UI surface colors: cập nhật theo Light Blue Design System.
export const C = {
  // ── Data colors ─────────────────────────────────────────────────────────────
  pm1:    "#7b2d8b",
  pm25:   "#c4314b",
  pm10:   "#d15b00",
  aqi:    "#0078d4",
  temp:   "#00875a",
  hum:    "#1a6fad",

  // ── UI surface colors (light blue design system) ─────────────────────────────
  border:  "#c8d6e5",              // viền xanh nhạt
  muted:   "#6b7a90",              // text phụ
  text:    "#1e2a3a",              // text chính — navy đậm
  subtext: "#6b7a90",              // text phụ
  bg:      "#ffffff",              // card/surface — trắng
  bgPage:  "#f0f4f8",              // page canvas — xanh trắng nhẹ
  white:   "#ffffff",              // white

  // ── Accent / interactive ────────────────────────────────────────────────────
  blue:      "#0078d4",            // CTA chính — xanh dương Microsoft
  blueDark:  "#005a9e",            // hover state
  blueLight: "#38bdf8",            // sky blue accent
  bluePale:  "#ddeaf7",            // nền card highlight nhẹ
  navy:      "#0d3558",            // sidebar / header navy
  skyBg:     "#e4f0fb",            // nền xanh cực nhạt

  // Legacy aliases (backward compat)
  neon:       "#0078d4",           // trước là #faff69, nay map sang blue
  green:      "#00875a",
  paleYellow: "#ddeaf7",           // trước là vàng nhạt, nay là xanh nhạt
} as const;

export const SENSOR_COLORS = [
  "#0078d4", "#c4314b", "#00875a", "#d15b00", "#7b2d8b",
  "#1a6fad", "#38bdf8", "#ef476f", "#06d6a0", "#5e60ce",
];

export const AQI_LEVELS = [
  { max: 50,  label: "Tốt",            color: "#00875a", bg: "rgba(0,135,90,0.10)"    },
  { max: 100, label: "Trung bình",     color: "#b8860b", bg: "rgba(184,134,11,0.10)"  },
  { max: 150, label: "Nhạy cảm",      color: "#d15b00", bg: "rgba(209,91,0,0.10)"    },
  { max: 200, label: "Không tốt",     color: "#c4314b", bg: "rgba(196,49,75,0.10)"   },
  { max: 300, label: "Rất không tốt", color: "#6b2f8f", bg: "rgba(107,47,143,0.10)"  },
  { max: 999, label: "Nguy hại",      color: "#7b0000", bg: "rgba(123,0,0,0.10)"     },
] as const;

export const STATUS_LABEL: Record<string, string> = {
  active:      "Hoạt động",
  maintenance: "Bảo trì",
  inactive:    "Không hoạt động",
};

export const STATUS_COLOR: Record<string, string> = {
  active:      "#00875a",
  maintenance: "#b8860b",
  inactive:    "#93b8d8",
};

export const ALERT_META: Record<string, { color: string; label: string }> = {
  high_pm25: { color: "#c4314b", label: "PM2.5 vượt ngưỡng" },
  high_pm10: { color: "#d15b00", label: "PM10 vượt ngưỡng"  },
  high_aqi:  { color: "#6b2f8f", label: "AQI vượt ngưỡng"   },
};

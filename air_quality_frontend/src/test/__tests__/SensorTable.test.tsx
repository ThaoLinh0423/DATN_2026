import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@/test/utils";
import { SensorTable } from "@/components/sensors/SensorTable";
import { Sensor } from "@/types/api";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const mockSensors: Sensor[] = [
  {
    id: 1,
    sensor_code: "Serial_PKHaNoi_XNMau_001",
    sensor_name: "Airc_Erba_lyte_001",
    location_id: 1,
    sensor_type: "serial",
    measurement_type: "Mẫu máu",
    brand: "Erba Lachema",
    status: "Đã kích hoạt",
    last_reading_at: "2025-01-15T10:30:00",
    created_at: "2025-01-01T00:00:00",
  },
  {
    id: 2,
    sensor_code: "Sever_PKHaNoi_XNMau_002",
    sensor_name: "Erba_Lyte_72",
    location_id: 1,
    sensor_type: "tcp_server",
    measurement_type: "Mẫu máu",
    brand: "VBSN_QQ",
    status: "Bảo trì",
    last_reading_at: "2025-01-14T16:20:00",
    created_at: "2025-01-02T00:00:00",
  },
  {
    id: 3,
    sensor_code: "Serial_DaNang_PM10_001",
    sensor_name: "PM10_Sensor_001",
    location_id: 4,
    sensor_type: "serial",
    measurement_type: "PM10",
    brand: "Honeywell",
    status: "Chưa kích hoạt",
    last_reading_at: "2025-01-10T14:00:00",
    created_at: "2025-01-03T00:00:00",
  },
];

describe("SensorTable", () => {
  let onEdit: ReturnType<typeof vi.fn>;
  let onDelete: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onEdit = vi.fn();
    onDelete = vi.fn();
    vi.clearAllMocks();
  });

  // ── Header ─────────────────────────────────────────────────────────────────
  it("renders all column headers", () => {
    render(<SensorTable sensors={mockSensors} onEdit={onEdit} onDelete={onDelete} />);
    expect(screen.getByText("Thao tác")).toBeInTheDocument();
    expect(screen.getByText("Tên thiết bị")).toBeInTheDocument();
    expect(screen.getByText("Mã thiết bị")).toBeInTheDocument();
    expect(screen.getByText("Máy trạm")).toBeInTheDocument();
    expect(screen.getByText("Mẫu Xét Nghiệm")).toBeInTheDocument();
    expect(screen.getByText("Hãng Sản Xuất")).toBeInTheDocument();
    expect(screen.getByText("Loại kết nối")).toBeInTheDocument();
    expect(screen.getByText("Trạng thái")).toBeInTheDocument();
  });

  // ── Rows ──────────────────────────────────────────────────────────────────
  it("renders one row per sensor", () => {
    render(<SensorTable sensors={mockSensors} onEdit={onEdit} onDelete={onDelete} />);
    // each sensor_code appears once in the table body
    expect(screen.getByText("Serial_PKHaNoi_XNMau_001")).toBeInTheDocument();
    expect(screen.getByText("Sever_PKHaNoi_XNMau_002")).toBeInTheDocument();
    expect(screen.getByText("Serial_DaNang_PM10_001")).toBeInTheDocument();
  });

  it("renders sensor_name for each row", () => {
    render(<SensorTable sensors={mockSensors} onEdit={onEdit} onDelete={onDelete} />);
    expect(screen.getByText("Airc_Erba_lyte_001")).toBeInTheDocument();
    expect(screen.getByText("Erba_Lyte_72")).toBeInTheDocument();
  });

  it("renders brand for each row", () => {
    render(<SensorTable sensors={mockSensors} onEdit={onEdit} onDelete={onDelete} />);
    expect(screen.getByText("Erba Lachema")).toBeInTheDocument();
    expect(screen.getByText("VBSN_QQ")).toBeInTheDocument();
    expect(screen.getByText("Honeywell")).toBeInTheDocument();
  });

  it("renders sensor_type for each row", () => {
    render(<SensorTable sensors={mockSensors} onEdit={onEdit} onDelete={onDelete} />);
    // "serial" appears for sensor 1 and 3
    const serialCells = screen.getAllByText("serial");
    expect(serialCells.length).toBe(2);
    expect(screen.getByText("tcp_server")).toBeInTheDocument();
  });

  it("renders measurement_type", () => {
    render(<SensorTable sensors={mockSensors} onEdit={onEdit} onDelete={onDelete} />);
    // "Mẫu máu" appears for sensor 1 and 2
    const mauMauCells = screen.getAllByText("Mẫu máu");
    expect(mauMauCells.length).toBe(2);
    expect(screen.getByText("PM10")).toBeInTheDocument();
  });

  // ── Status badges ──────────────────────────────────────────────────────────
  it("renders SensorStatusBadge for each sensor", () => {
    render(<SensorTable sensors={mockSensors} onEdit={onEdit} onDelete={onDelete} />);
    expect(screen.getByText("Đã kích hoạt")).toBeInTheDocument();
    expect(screen.getByText("Bảo trì")).toBeInTheDocument();
    expect(screen.getByText("Chưa kích hoạt")).toBeInTheDocument();
  });

  // ── Location lookup ────────────────────────────────────────────────────────
  it("resolves location_id 1 to 'Hà Nội - Tây Hồ'", () => {
    render(<SensorTable sensors={mockSensors} onEdit={onEdit} onDelete={onDelete} />);
    // mockLocations has id=1 → "Hà Nội - Tây Hồ" (appears for sensor 1 & 2)
    const locationCells = screen.getAllByText("Hà Nội - Tây Hồ");
    expect(locationCells.length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'N/A' for unknown location_id", () => {
    const unknownSensor: Sensor = {
      ...mockSensors[0],
      id: 99,
      sensor_code: "UNKNOWN",
      location_id: 9999,
    };
    render(
      <SensorTable sensors={[unknownSensor]} onEdit={onEdit} onDelete={onDelete} />
    );
    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  // ── Empty state ────────────────────────────────────────────────────────────
  it("renders table with empty tbody when no sensors", () => {
    render(<SensorTable sensors={[]} onEdit={onEdit} onDelete={onDelete} />);
    // Headers still present
    expect(screen.getByText("Tên thiết bị")).toBeInTheDocument();
    // No sensor data rows
    expect(screen.queryByText("Serial_PKHaNoi_XNMau_001")).not.toBeInTheDocument();
  });

  // ── Action buttons – onEdit ────────────────────────────────────────────────
  it("calls onEdit with correct sensor when edit button is clicked", () => {
    render(<SensorTable sensors={mockSensors} onEdit={onEdit} onDelete={onDelete} />);
    // Each row has 4 icon buttons: Pencil, Hash, Lock, Trash2
    // The first Pencil button corresponds to the first sensor
    const editButtons = screen.getAllByRole("button").filter((btn) => {
      // Pencil SVG has lucide-pencil or similar; easiest: filter by position
      // We'll use the title or aria if available, otherwise filter by order
      return btn.querySelector("svg");
    });
    // click the very first button in row 1 (Pencil icon)
    const allRowButtons = screen.getAllByRole("button");
    // Row 1 action buttons start at index 0: [Pencil, Hash, Lock, Trash2]
    fireEvent.click(allRowButtons[0]);
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledWith(mockSensors[0]);
  });

  // ── Action buttons – onDelete ──────────────────────────────────────────────
  it("calls onDelete with correct sensor when delete button is clicked", () => {
    render(<SensorTable sensors={mockSensors} onEdit={onEdit} onDelete={onDelete} />);
    const allRowButtons = screen.getAllByRole("button");
    // Row 1: [Pencil=0, Hash=1, Lock=2, Trash=3]
    fireEvent.click(allRowButtons[3]);
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledWith(mockSensors[0]);
  });

  it("calls onDelete with the second sensor's data when second row delete is clicked", () => {
    render(<SensorTable sensors={mockSensors} onEdit={onEdit} onDelete={onDelete} />);
    const allRowButtons = screen.getAllByRole("button");
    // Row 2 buttons: indices 4 (Pencil), 5 (Hash), 6 (Lock), 7 (Trash)
    fireEvent.click(allRowButtons[7]);
    expect(onDelete).toHaveBeenCalledWith(mockSensors[1]);
  });

  // ── Accessibility ──────────────────────────────────────────────────────────
  it("renders a <table> element", () => {
    render(<SensorTable sensors={mockSensors} onEdit={onEdit} onDelete={onDelete} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});

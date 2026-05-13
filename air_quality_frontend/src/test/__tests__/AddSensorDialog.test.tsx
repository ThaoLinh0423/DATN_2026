import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { AddSensorDialog } from "@/components/sensors/AddSensorDialog";

function defaultProps(overrides = {}) {
  return {
    open: true,
    onOpenChange: vi.fn(),
    onAdd: vi.fn(),
    ...overrides,
  };
}

describe("AddSensorDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Visibility ─────────────────────────────────────────────────────────────
  it("renders dialog title when open=true", () => {
    render(<AddSensorDialog {...defaultProps()} />);
    expect(screen.getByText("Thêm trạm đo mới")).toBeInTheDocument();
  });

  it("does not render dialog content when open=false", () => {
    render(<AddSensorDialog {...defaultProps({ open: false })} />);
    expect(screen.queryByText("Thêm trạm đo mới")).not.toBeInTheDocument();
  });

  // ── Form fields ────────────────────────────────────────────────────────────
  it("renders all form labels", () => {
    render(<AddSensorDialog {...defaultProps()} />);
    expect(screen.getByLabelText("Mã thiết bị")).toBeInTheDocument();
    expect(screen.getByLabelText("Tên thiết bị")).toBeInTheDocument();
    expect(screen.getByLabelText("Hãng sản xuất")).toBeInTheDocument();
  });

  it("renders location select dropdown", () => {
    render(<AddSensorDialog {...defaultProps()} />);
    expect(screen.getByText("Chọn máy trạm")).toBeInTheDocument();
  });

  it("renders action buttons: Hủy and Thêm mới", () => {
    render(<AddSensorDialog {...defaultProps()} />);
    expect(screen.getByRole("button", { name: "Hủy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thêm mới" })).toBeInTheDocument();
  });

  // ── Input typing ───────────────────────────────────────────────────────────
  it("updates sensor_code input on typing", async () => {
    render(<AddSensorDialog {...defaultProps()} />);
    const input = screen.getByLabelText("Mã thiết bị");
    await userEvent.type(input, "Serial_001");
    expect((input as HTMLInputElement).value).toBe("Serial_001");
  });

  it("updates sensor_name input on typing", async () => {
    render(<AddSensorDialog {...defaultProps()} />);
    const input = screen.getByLabelText("Tên thiết bị");
    await userEvent.type(input, "Erba_Lyte");
    expect((input as HTMLInputElement).value).toBe("Erba_Lyte");
  });

  it("updates brand input on typing", async () => {
    render(<AddSensorDialog {...defaultProps()} />);
    const input = screen.getByLabelText("Hãng sản xuất");
    await userEvent.type(input, "Sensirion");
    expect((input as HTMLInputElement).value).toBe("Sensirion");
  });

  // ── Cancel button ──────────────────────────────────────────────────────────
  it("calls onOpenChange(false) when Hủy is clicked", () => {
    const onOpenChange = vi.fn();
    render(<AddSensorDialog {...defaultProps({ onOpenChange })} />);
    fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // ── Submit ─────────────────────────────────────────────────────────────────
  it("calls onAdd with form data when Thêm mới is clicked", async () => {
    const onAdd = vi.fn();
    const onOpenChange = vi.fn();
    render(<AddSensorDialog {...defaultProps({ onAdd, onOpenChange })} />);

    await userEvent.type(screen.getByLabelText("Mã thiết bị"), "CODE-001");
    await userEvent.type(screen.getByLabelText("Tên thiết bị"), "Sensor Name");
    await userEvent.type(screen.getByLabelText("Hãng sản xuất"), "Brand X");

    fireEvent.click(screen.getByRole("button", { name: "Thêm mới" }));

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledOnce();
    });

    const callArg = onAdd.mock.calls[0][0];
    expect(callArg.sensor_code).toBe("CODE-001");
    expect(callArg.sensor_name).toBe("Sensor Name");
    expect(callArg.brand).toBe("Brand X");
  });

  it("resets form and calls onOpenChange(false) after successful submit", async () => {
    const onOpenChange = vi.fn();
    render(<AddSensorDialog {...defaultProps({ onOpenChange })} />);

    await userEvent.type(screen.getByLabelText("Mã thiết bị"), "CODE-001");
    fireEvent.click(screen.getByRole("button", { name: "Thêm mới" }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("passes default status 'Chưa kích hoạt' when no status is selected", async () => {
    const onAdd = vi.fn();
    render(<AddSensorDialog {...defaultProps({ onAdd })} />);

    fireEvent.click(screen.getByRole("button", { name: "Thêm mới" }));

    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(onAdd.mock.calls[0][0].status).toBe("Chưa kích hoạt");
  });
});

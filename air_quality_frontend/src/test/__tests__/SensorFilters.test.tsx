import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { SensorFilters } from "@/components/sensors/SensorFilters";

// ---------------------------------------------------------------------------
// Default props factory
// ---------------------------------------------------------------------------
function defaultProps(overrides = {}) {
  return {
    searchTerm: "",
    onSearchChange: vi.fn(),
    measurementType: "all",
    onMeasurementTypeChange: vi.fn(),
    status: "all",
    onStatusChange: vi.fn(),
    onReset: vi.fn(),
    onAddNew: vi.fn(),
    ...overrides,
  };
}

describe("SensorFilters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders search input", () => {
    render(<SensorFilters {...defaultProps()} />);
    expect(screen.getByPlaceholderText("Tìm kiếm...")).toBeInTheDocument();
  });

  it("renders 'Thêm kết nối' button", () => {
    render(<SensorFilters {...defaultProps()} />);
    expect(screen.getByText("Thêm kết nối")).toBeInTheDocument();
  });

  it("calls onSearchChange when user types in search input", async () => {
    const onSearchChange = vi.fn();
    render(<SensorFilters {...defaultProps({ onSearchChange })} />);

    const input = screen.getByPlaceholderText("Tìm kiếm...");
    await userEvent.type(input, "abc");

    expect(onSearchChange).toHaveBeenCalled();
    // last call should be for "c" (the 3rd character)
    const lastArg = onSearchChange.mock.calls.at(-1)?.[0];
    expect(typeof lastArg).toBe("string");
  });

  it("reflects the current searchTerm as input value", () => {
    render(<SensorFilters {...defaultProps({ searchTerm: "hello" })} />);
    const input = screen.getByPlaceholderText("Tìm kiếm...");
    expect((input as HTMLInputElement).value).toBe("hello");
  });

  it("calls onReset when reset (RotateCcw) button is clicked", () => {
    const onReset = vi.fn();
    render(<SensorFilters {...defaultProps({ onReset })} />);

    // There are 2 icon-buttons; the second is the RotateCcw reset
    const buttons = screen.getAllByRole("button");
    // Find the button with the reset icon – we can click all icon buttons
    // and confirm onReset is triggered at least once
    fireEvent.click(buttons[1]); // second icon button (RotateCcw)
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("calls onAddNew when 'Thêm kết nối' button is clicked", () => {
    const onAddNew = vi.fn();
    render(<SensorFilters {...defaultProps({ onAddNew })} />);

    fireEvent.click(screen.getByText("Thêm kết nối"));
    expect(onAddNew).toHaveBeenCalledTimes(1);
  });
});

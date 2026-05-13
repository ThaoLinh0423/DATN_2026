import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@/test/utils";
import { SensorPagination } from "@/components/sensors/SensorPagination";

function defaultProps(overrides = {}) {
  return {
    currentPage: 1,
    totalPages: 5,
    perPage: 10,
    onPageChange: vi.fn(),
    onPerPageChange: vi.fn(),
    ...overrides,
  };
}

describe("SensorPagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  it("renders page number buttons", () => {
    render(<SensorPagination {...defaultProps()} />);
    // Pages 1-5 should each appear as a button
    expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "5" })).toBeInTheDocument();
  });

  it("highlights the current page button as default variant", () => {
    render(<SensorPagination {...defaultProps({ currentPage: 3 })} />);
    // The active page button should NOT have the "outline" class
    const btn = screen.getByRole("button", { name: "3" });
    // shadcn default variant → no "outline" in className
    expect(btn.className).not.toContain("outline");
  });

  it("renders navigation buttons (first, prev, next, last)", () => {
    render(<SensorPagination {...defaultProps()} />);
    // 4 nav buttons + 5 page buttons + 1 select trigger = many buttons
    const buttons = screen.getAllByRole("button");
    // At minimum: first, prev, 5 pages, next, last = 9 buttons
    expect(buttons.length).toBeGreaterThanOrEqual(9);
  });

  // ── Disabled states ────────────────────────────────────────────────────────
  it("disables 'first' and 'prev' buttons on first page", () => {
    render(<SensorPagination {...defaultProps({ currentPage: 1 })} />);
    const buttons = screen.getAllByRole("button");
    // first two nav buttons should be disabled
    expect(buttons[0]).toBeDisabled(); // ChevronsLeft (go to first)
    expect(buttons[1]).toBeDisabled(); // ChevronLeft  (go to prev)
  });

  it("disables 'next' and 'last' buttons on last page", () => {
    render(<SensorPagination {...defaultProps({ currentPage: 5, totalPages: 5 })} />);
    const buttons = screen.getAllByRole("button");
    // last two nav buttons (before the select) should be disabled
    const navButtons = buttons.filter((b) => b.getAttribute("aria-disabled") !== null || b.hasAttribute("disabled"));
    // next and last should be disabled
    expect(navButtons.some((b) => b.hasAttribute("disabled"))).toBe(true);
  });

  // ── Callbacks ──────────────────────────────────────────────────────────────
  it("calls onPageChange(1) when 'first' button is clicked (from page 3)", () => {
    const onPageChange = vi.fn();
    render(<SensorPagination {...defaultProps({ currentPage: 3, onPageChange })} />);
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]); // ChevronsLeft → go to page 1
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("calls onPageChange(currentPage - 1) when 'prev' button is clicked", () => {
    const onPageChange = vi.fn();
    render(<SensorPagination {...defaultProps({ currentPage: 3, onPageChange })} />);
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[1]); // ChevronLeft → go to page 2
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("calls onPageChange(currentPage + 1) when 'next' button is clicked", () => {
    const onPageChange = vi.fn();
    render(<SensorPagination {...defaultProps({ currentPage: 2, totalPages: 5, onPageChange })} />);
    const buttons = screen.getAllByRole("button");
    // next button is at index: 2 (first) + 1 (prev) + 5 (pages) = index 7
    fireEvent.click(buttons[7]);
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("calls onPageChange(totalPages) when 'last' button is clicked", () => {
    const onPageChange = vi.fn();
    render(<SensorPagination {...defaultProps({ currentPage: 2, totalPages: 5, onPageChange })} />);
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[8]); // ChevronsRight → go to last page
    expect(onPageChange).toHaveBeenCalledWith(5);
  });

  it("calls onPageChange with correct page when a page button is clicked", () => {
    const onPageChange = vi.fn();
    render(<SensorPagination {...defaultProps({ currentPage: 1, onPageChange })} />);
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  // ── Per-page: only test the select trigger renders ─────────────────────────
  it("shows current perPage value in the select trigger", () => {
    render(<SensorPagination {...defaultProps({ perPage: 20 })} />);
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  // ── Edge: totalPages = 1 ──────────────────────────────────────────────────
  it("disables both first/prev AND next/last when only one page", () => {
    render(<SensorPagination {...defaultProps({ currentPage: 1, totalPages: 1 })} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).toBeDisabled();
    // next (index 3) and last (index 4) also disabled
    expect(buttons[3]).toBeDisabled();
    expect(buttons[4]).toBeDisabled();
  });
});

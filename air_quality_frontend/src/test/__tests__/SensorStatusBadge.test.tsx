import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/utils";
import { SensorStatusBadge } from "@/components/sensors/SensorStatusBadge";

describe("SensorStatusBadge", () => {
  it('renders "Đã kích hoạt" text', () => {
    render(<SensorStatusBadge status="Đã kích hoạt" />);
    expect(screen.getByText("Đã kích hoạt")).toBeInTheDocument();
  });

  it('renders "Chưa kích hoạt" text', () => {
    render(<SensorStatusBadge status="Chưa kích hoạt" />);
    expect(screen.getByText("Chưa kích hoạt")).toBeInTheDocument();
  });

  it('renders "Bảo trì" text', () => {
    render(<SensorStatusBadge status="Bảo trì" />);
    expect(screen.getByText("Bảo trì")).toBeInTheDocument();
  });

  it('applies primary color classes for "Đã kích hoạt"', () => {
    render(<SensorStatusBadge status="Đã kích hoạt" />);
    const badge = screen.getByText("Đã kích hoạt");
    expect(badge.className).toContain("text-primary");
  });

  it('applies muted color classes for "Chưa kích hoạt"', () => {
    render(<SensorStatusBadge status="Chưa kích hoạt" />);
    const badge = screen.getByText("Chưa kích hoạt");
    expect(badge.className).toContain("text-muted-foreground");
  });

  it('applies destructive color classes for "Bảo trì"', () => {
    render(<SensorStatusBadge status="Bảo trì" />);
    const badge = screen.getByText("Bảo trì");
    expect(badge.className).toContain("text-destructive");
  });

  it("renders as a span element", () => {
    render(<SensorStatusBadge status="Đã kích hoạt" />);
    const badge = screen.getByText("Đã kích hoạt");
    expect(badge.tagName.toLowerCase()).toBe("span");
  });

  it("always includes base styling classes", () => {
    render(<SensorStatusBadge status="Đã kích hoạt" />);
    const badge = screen.getByText("Đã kích hoạt");
    expect(badge.className).toContain("inline-flex");
    expect(badge.className).toContain("rounded-md");
  });
});

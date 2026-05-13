import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, RotateCcw, Plus } from "lucide-react";

interface SensorFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  measurementType: string;
  onMeasurementTypeChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  onReset: () => void;
  onAddNew: () => void;
}

export function SensorFilters({
  searchTerm,
  onSearchChange,
  measurementType,
  onMeasurementTypeChange,
  status,
  onStatusChange,
  onReset,
  onAddNew,
}: SensorFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 mb-6">
      <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-[300px]">
        <Input
          placeholder="Tìm kiếm..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="bg-card"
        />
      </div>

      <Select value={measurementType} onValueChange={onMeasurementTypeChange}>
        <SelectTrigger className="w-[180px] bg-card">
          <SelectValue placeholder="Mẫu xét nghiệm" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả</SelectItem>
          <SelectItem value="Mẫu máu">Mẫu máu</SelectItem>
          <SelectItem value="PM2.5">PM2.5</SelectItem>
          <SelectItem value="PM10">PM10</SelectItem>
        </SelectContent>
      </Select>

      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger className="w-[180px] bg-card">
          <SelectValue placeholder="Trạng thái" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả</SelectItem>
          <SelectItem value="Đã kích hoạt">Đã kích hoạt</SelectItem>
          <SelectItem value="Chưa kích hoạt">Chưa kích hoạt</SelectItem>
          <SelectItem value="Bảo trì">Bảo trì</SelectItem>
        </SelectContent>
      </Select>

      <Button variant="outline" size="icon" onClick={onReset}>
        <Search className="h-4 w-4" />
      </Button>

      <Button variant="outline" size="icon" onClick={onReset}>
        <RotateCcw className="h-4 w-4" />
      </Button>

      <div className="flex-1" />

      <Button onClick={onAddNew} className="gap-2">
        <Plus className="h-4 w-4" />
        Thêm kết nối
      </Button>
    </div>
  );
}

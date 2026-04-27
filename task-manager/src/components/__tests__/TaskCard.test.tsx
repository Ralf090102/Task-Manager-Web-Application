import { render, screen } from "@testing-library/react";
import TaskCard from "../TaskCard";

const mockTask = {
  id: "test-id",
  title: "Test Task",
  description: "A test description",
  status: "TODO",
  priority: "HIGH",
  dueDate: null,
  createdAt: new Date().toISOString(),
};

const mockHandlers = {
  onStatusChange: jest.fn().mockResolvedValue(undefined),
  onDelete: jest.fn().mockResolvedValue(undefined),
};

describe("TaskCard", () => {
  it("renders task title and description", () => {
    render(<TaskCard task={mockTask} {...mockHandlers} />);
    expect(screen.getByText("Test Task")).toBeInTheDocument();
    expect(screen.getByText("A test description")).toBeInTheDocument();
  });

  it("displays priority badge", () => {
    render(<TaskCard task={mockTask} {...mockHandlers} />);
    expect(screen.getByText("HIGH")).toBeInTheDocument();
  });

  it("shows status select with current value", () => {
    render(<TaskCard task={mockTask} {...mockHandlers} />);
    const select = screen.getByRole("combobox");
    expect(select).toHaveValue("TODO");
  });

  it("renders delete button hidden by default", () => {
    render(<TaskCard task={mockTask} {...mockHandlers} />);
    const deleteBtn = screen.getByTitle("Delete task");
    expect(deleteBtn).toHaveClass("opacity-0");
  });

  it("shows overdue indicator for past due tasks", () => {
    const overdueTask = {
      ...mockTask,
      dueDate: "2020-01-01",
    };
    render(<TaskCard task={overdueTask} {...mockHandlers} />);
    expect(screen.getByText(/Overdue/)).toBeInTheDocument();
  });
});

import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import SolveModal, { getSavedUsername, ModalMode } from "../components/SolveModal";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("CALADAY_USERNAME", "ALU");
});
afterEach(() => jest.restoreAllMocks());

it.each<ModalMode>(["edit", "submit"])("rejects invalid names in %s mode and accepts corrected names", async (mode) => {
  const onClose = jest.fn();
  const onSubmit = jest.fn().mockResolvedValue(undefined);
  render(<SolveModal isOpen mode={mode} onClose={onClose} onSubmit={onSubmit} />);
  const input = screen.getByPlaceholderText("AAA");
  fireEvent.change(input, { target: { value: "A1" } });
  expect(screen.getByRole("alert")).toHaveTextContent("Name must be 1-3 letters");
  expect(screen.getByRole("button", { name: mode === "edit" ? "Save" : "Submit" })).toBeDisabled();
  expect(getSavedUsername()).toBe("ALU");
  expect(onSubmit).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();

  fireEvent.change(input, { target: { value: "bob" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: mode === "edit" ? "Save" : "Submit" }));
  });
  expect(getSavedUsername()).toBe("BOB");
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onSubmit).toHaveBeenCalledTimes(mode === "submit" ? 1 : 0);
});

it("ignores a previously saved invalid name so automatic submissions can ask for a replacement", () => {
  localStorage.setItem("CALADAY_USERNAME", "A1");
  expect(getSavedUsername()).toBeNull();
  render(<SolveModal isOpen mode="submit" onClose={jest.fn()} />);
  expect(screen.getByPlaceholderText("AAA")).toHaveValue("");
});

it("closes a successful submission even when remembering the name fails", async () => {
  const onClose = jest.fn();
  const onSubmit = jest.fn().mockResolvedValue(undefined);
  render(<SolveModal isOpen mode="submit" onClose={onClose} onSubmit={onSubmit} />);
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Submit" })); });
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("still permits retrying a server failure", async () => {
  const onClose = jest.fn();
  const onSubmit = jest.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(undefined);
  render(<SolveModal isOpen mode="submit" onClose={onClose} onSubmit={onSubmit} />);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Submit" })); });
  expect(screen.getByRole("alert")).toHaveTextContent("Offline");
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Submit" })); });
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onSubmit).toHaveBeenCalledTimes(2);
});

it.each(["success", "failure"])("ignores a delayed submission %s after closing and reopening to edit a name", async (result) => {
  let finish!: () => void;
  const onSubmit = jest.fn(() => new Promise<void>((resolve, reject) => {
    finish = result === "success" ? resolve : () => reject(new Error("Offline"));
  }));
  const onClose = jest.fn();
  const { rerender } = render(<SolveModal isOpen mode="submit" onClose={onClose} onSubmit={onSubmit} />);
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  rerender(<SolveModal isOpen={false} mode="submit" onClose={onClose} onSubmit={onSubmit} />);
  rerender(<SolveModal isOpen mode="edit" onClose={onClose} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "BOB" } });
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(getSavedUsername()).toBe("BOB");
  await act(async () => { finish(); });
  expect(getSavedUsername()).toBe("BOB");
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import Modal from "../components/Modal";

afterEach(() => jest.restoreAllMocks());

it("lets inputs receive pointer and keyboard events without triggering the puzzle underneath", () => {
  const onClose = jest.fn();
  const gamePointer = jest.fn();
  const gameKey = jest.fn();
  window.addEventListener("keydown", gameKey);
  try {
    render(
      <div onPointerDown={gamePointer} onPointerMove={gamePointer} onPointerUp={gamePointer}>
        <Modal isOpen onClose={onClose} labelledBy="name-title">
          <h2 id="name-title">Name</h2>
          <input aria-label="Name" autoFocus />
        </Modal>
      </div>,
    );
    const input = screen.getByRole("textbox");
    expect(input).toHaveFocus();
    expect(fireEvent.pointerDown(input)).toBe(true);
    expect(fireEvent.pointerMove(input)).toBe(true);
    expect(fireEvent.pointerUp(input)).toBe(true);
    fireEvent.click(input);
    for (const key of ["r", "f", "x", "Backspace", "Delete"]) {
      // Native editing must retain its default action.
      expect(fireEvent.keyDown(input, { key })).toBe(true);
    }
    expect(gameKey).not.toHaveBeenCalled();
    expect(gamePointer).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  } finally {
    window.removeEventListener("keydown", gameKey);
  }
});

it("keeps a full-screen shade while the dialog follows keyboard resize and scroll", () => {
  const viewport = Object.assign(new EventTarget(), { offsetTop: 0, height: 844 });
  const original = Object.getOwnPropertyDescriptor(window, "visualViewport");
  Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  try {
    const onClose = jest.fn();
    const { unmount } = render(
      <Modal isOpen onClose={onClose} labelledBy="title">
        <h2 id="title">Name</h2>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    const positioner = dialog.parentElement!;
    const shade = positioner.parentElement!;
    expect(shade.parentElement).toBe(document.body);
    expect(shade).toHaveClass("fixed", "inset-0", "bg-black/50");
    act(() => {
      viewport.height = 450;
      viewport.dispatchEvent(new Event("resize"));
      viewport.offsetTop = 30;
      viewport.dispatchEvent(new Event("scroll"));
    });
    expect(positioner).toHaveStyle({ top: "30px", height: "450px" });
    expect(shade.style.height).toBe("");
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(positioner);
    fireEvent.click(shade);
    expect(onClose).toHaveBeenCalledTimes(2);
    const remove = jest.spyOn(viewport, "removeEventListener");
    unmount();
    expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
  } finally {
    if (original) Object.defineProperty(window, "visualViewport", original);
    else Reflect.deleteProperty(window, "visualViewport");
  }
});

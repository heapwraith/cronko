import "@testing-library/jest-dom/vitest"
import { afterEach, vi } from "vitest"

// jsdom has no <dialog> modal support; ConfirmModal relies on it.
HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
  this.setAttribute("open", "")
}
HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
  this.removeAttribute("open")
  this.dispatchEvent(new Event("close"))
}

window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false,
  onchange: null,
})) as typeof window.matchMedia

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

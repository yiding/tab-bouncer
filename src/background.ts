import type Browser from "webextension-polyfill";
import type { Tabs } from "webextension-polyfill";
declare const browser: typeof Browser;

function isDarkMode() {
  return (
    window.matchMedia &&
    !!window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

interface Writable<T> {
  get(): Promise<T>;
  update(f: (v: T) => T): Promise<void>;
  set(v: T): Promise<void>;
}

function sessionWritable<T>(key: string, defaultValue: T): Writable<T> {
  const get = async () => {
    const val = await browser.storage.session.get({ [key]: defaultValue });
    return val[key] as T;
  };
  const set = async (v: T) => {
    await browser.storage.session.set({ [key]: v });
  };
  const update = async (f: (v: T) => T) => {
    await set(f(await get()));
  };

  return {
    get,
    set,
    update,
  };
}

const sLockedWindowIds = sessionWritable<number[]>("lockedWindowIds", []);
const sFocusedWindowStack = sessionWritable<number[]>("focusedWindowStack", []);

browser.tabs.onCreated.addListener(async (tab: Tabs.Tab) => {
  const { id: tabId, windowId } = tab;
  if (windowId === undefined || tabId === undefined) {
    return;
  }
  const lockedWindowIds = await sLockedWindowIds.get();
  if (lockedWindowIds.includes(windowId)) {
    // Find a recently focused window that's not locked and move tab there.
    const focusedWindowStack = await sFocusedWindowStack.get();
    const destWindow = focusedWindowStack.find(
      (p) => !lockedWindowIds.includes(p)
    );

    if (destWindow === undefined) {
      // If there are no unlocked windows, create a new window.
      await browser.windows.create({ tabId });
    } else {
      await browser.tabs.move(tabId, {
        windowId: destWindow,
        index: -1,
      });
      await browser.tabs.update(tabId, { active: true });
    }
  }
});

browser.windows.onRemoved.addListener(async (windowId: number) => {
  await sLockedWindowIds.update((ids) => ids.filter((id) => id !== windowId));
  await sFocusedWindowStack.update((ids) =>
    ids.filter((id) => id !== windowId)
  );
});

browser.windows.onFocusChanged.addListener(async (windowId: number) => {
  // move window to front of list.
  const window = await browser.windows.get(windowId);
  if (window.type !== "normal") {
    return;
}
  await sFocusedWindowStack.update((stack) => [
    windowId,
    ...stack.filter((w) => w !== windowId),
  ].slice(0, 20));
});

browser.action.onClicked.addListener(async (tab, info) => {
  const { windowId } = tab;
  if (windowId === undefined) {
    console.error("windowId is undefined");
    return;
  }
  const lockedWindowIds = await sLockedWindowIds.get();
  if (lockedWindowIds.includes(windowId)) {
    console.info("Unlocking window", windowId);
    await sLockedWindowIds.update((ids) => ids.filter((id) => id !== windowId));
    await browser.action.setIcon({ windowId });
  } else {
    console.info("Locking window", windowId);
    await sLockedWindowIds.update((ids) => [...ids, windowId]);
    const imagePath = isDarkMode() ? "locked-dark.svg" : "locked.svg";
    await browser.action.setIcon({ windowId, path: imagePath });
    await browser.action.setTitle({
      windowId,
      title: "Allow tabs to open in this window",
    });
  }
});

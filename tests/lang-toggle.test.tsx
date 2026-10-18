// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LangToggle from "../src/components/LangToggle";

afterEach(() => cleanup());

describe("LangToggle", () => {
  beforeEach(() => {
    document.cookie = "int191-language=; max-age=0; path=/";
  });

  it("marks the active language as pressed", () => {
    render(<LangToggle lang="en" />);
    expect(screen.getByRole("button", { name: "EN" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "ไทย" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("writes the cookie and reloads when the other language is chosen", async () => {
    const reload = vi.fn();
    render(<LangToggle lang="th" onSwitch={reload} />);
    await userEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(document.cookie).toContain("int191-language=en");
    expect(reload).toHaveBeenCalled();
  });

  it("does nothing when the active language is clicked again", async () => {
    const reload = vi.fn();
    render(<LangToggle lang="th" onSwitch={reload} />);
    await userEvent.click(screen.getByRole("button", { name: "ไทย" }));
    expect(reload).not.toHaveBeenCalled();
  });
});

it('keeps multiple language controls synchronized for client-side learning islands',async()=>{
 render(<><LangToggle lang="th" onSwitch={()=>{}}/><LangToggle lang="th" onSwitch={()=>{}}/></>);
 await userEvent.click(screen.getAllByRole('button',{name:'EN'})[0]);
 expect(screen.getAllByRole('button',{name:'EN'}).every(b=>b.getAttribute('aria-pressed')==='true')).toBe(true);
 await userEvent.click(screen.getAllByRole('button',{name:'ไทย'})[1]);
 expect(screen.getAllByRole('button',{name:'ไทย'}).every(b=>b.getAttribute('aria-pressed')==='true')).toBe(true);
});

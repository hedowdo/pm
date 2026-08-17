import { expect, test, type Page } from "@playwright/test";
import { initialBoardState, type BoardState } from "../src/lib/board";

async function waitForBoardSave(page: Page, action: () => Promise<void>) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/board") && response.request().method() === "PUT",
  );
  await action();
  expect((await responsePromise).ok()).toBe(true);
  await expect(page.getByText("Saving...")).toHaveCount(0);
}

async function replaceBoard(page: Page, board: BoardState) {
  const status = await page.evaluate(async (nextBoard) => {
    const response = await fetch("/api/board", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextBoard),
    });
    return response.status;
  }, board);
  expect(status).toBe(200);
}

test("persists the complete Kanban workflow through the backend", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Kanban board" })).toHaveCount(0);

  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("region", { name: "Kanban board" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  expect(await page.evaluate(() => document.cookie)).not.toContain("kanban_session");

  const originalBoard = await page.evaluate(async () => {
    const response = await fetch("/api/board", { credentials: "same-origin" });
    return response.json() as Promise<BoardState>;
  });

  try {
    await replaceBoard(page, initialBoardState);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Ideas" })).toBeVisible();

    await waitForBoardSave(page, async () => {
      await page.getByRole("button", { name: "Rename Ideas" }).click();
      const columnName = page.getByRole("textbox", { name: "Column name" });
      await columnName.fill("Brainstorm");
      await columnName.press("Enter");
    });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Brainstorm" })).toBeVisible();

    await waitForBoardSave(page, async () => {
      await page.getByRole("button", { name: "Add card to Brainstorm" }).click();
      await page.getByLabel("Card title").fill("Prepare launch recap");
      await page.getByLabel(/Details/).fill("Share the key decisions and next steps.");
      await page.getByRole("button", { name: "Create card" }).click();
    });
    await page.reload();
    await expect(page.getByText("Prepare launch recap")).toBeVisible();

    await waitForBoardSave(page, async () => {
      await page.getByText("Prepare launch recap").click();
      await page.getByLabel("Card title").fill("Prepare polished launch recap");
      await page.getByRole("button", { name: "Save changes" }).click();
    });
    await page.reload();
    await expect(page.getByText("Prepare polished launch recap")).toBeVisible();

    await waitForBoardSave(page, async () => {
      const dragHandle = page.getByRole("button", {
        name: "Drag Prepare polished launch recap",
      });
      const reviewColumn = page.getByTestId("column-review");
      const handleBox = await dragHandle.boundingBox();
      const targetBox = await reviewColumn.boundingBox();
      if (!handleBox || !targetBox) throw new Error("Expected drag targets to be visible");

      await page.mouse.move(
        handleBox.x + handleBox.width / 2,
        handleBox.y + handleBox.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        targetBox.x + targetBox.width / 2,
        targetBox.y + targetBox.height / 2,
        { steps: 12 },
      );
      await page.mouse.up();
    });
    await page.reload();
    const reviewColumn = page.getByTestId("column-review");
    await expect(reviewColumn.getByText("Prepare polished launch recap")).toBeVisible();

    const reviewCards = reviewColumn.getByTestId("kanban-card");
    const secondReviewCard = reviewCards.nth(1);
    const secondReviewTitle = await secondReviewCard.getByRole("heading").innerText();
    await waitForBoardSave(page, async () => {
      const secondReviewHandle = secondReviewCard.getByRole("button", { name: /Drag/ });
      await secondReviewHandle.focus();
      await secondReviewHandle.press("Space");
      await expect(secondReviewHandle).toHaveAttribute("aria-pressed", "true");
      await page.waitForTimeout(100);
      await secondReviewHandle.press("ArrowUp");
      await page.waitForTimeout(100);
      await secondReviewHandle.press("Space");
    });
    await page.reload();
    await expect(
      page.getByTestId("column-review").getByTestId("kanban-card").nth(0).getByRole("heading"),
    ).toHaveText(secondReviewTitle);

    await waitForBoardSave(page, async () => {
      const recapCard = page.getByTestId("column-review").getByTestId("kanban-card").filter({
        hasText: "Prepare polished launch recap",
      });
      await recapCard.click();
      await page.getByRole("button", { name: "Delete card" }).click();
      await page.getByRole("button", { name: "Confirm delete" }).click();
    });
    await page.reload();
    await expect(page.getByText("Prepare polished launch recap")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Brainstorm" })).toBeVisible();
    expect(
      await page.evaluate(() => window.localStorage.getItem("kanban-mvp.board.v1")),
    ).toBeNull();
  } finally {
    await replaceBoard(page, originalBoard);
  }

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("region", { name: "Kanban board" })).toHaveCount(0);
});

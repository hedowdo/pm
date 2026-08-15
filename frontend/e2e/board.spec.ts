import { expect, test } from "@playwright/test";

test("protects and supports the complete Kanban workflow", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Kanban board" })).toHaveCount(0);

  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("region", { name: "Kanban board" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  expect(await page.evaluate(() => document.cookie)).not.toContain("kanban_session");

  await page.reload();
  await expect(page.getByRole("region", { name: "Kanban board" })).toBeVisible();

  await page.getByRole("button", { name: "Rename Ideas" }).click();
  const columnName = page.getByRole("textbox", { name: "Column name" });
  await columnName.fill("Brainstorm");
  await columnName.press("Enter");
  await expect(page.getByRole("heading", { name: "Brainstorm" })).toBeVisible();

  await page.getByRole("button", { name: "Add card to Brainstorm" }).click();
  await page.getByLabel("Card title").fill("Prepare launch recap");
  await page.getByLabel(/Details/).fill("Share the key decisions and next steps.");
  await page.getByRole("button", { name: "Create card" }).click();
  await expect(page.getByText("Prepare launch recap")).toBeVisible();

  await page.getByText("Prepare launch recap").click();
  await page.getByLabel("Card title").fill("Prepare polished launch recap");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Prepare polished launch recap")).toBeVisible();

  const dragHandle = page.getByRole("button", {
    name: "Drag Prepare polished launch recap",
  });
  const reviewColumn = page.getByTestId("column-review");
  const handleBox = await dragHandle.boundingBox();
  const targetBox = await reviewColumn.boundingBox();
  if (!handleBox || !targetBox) throw new Error("Expected drag targets to be visible");

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(reviewColumn.getByText("Prepare polished launch recap")).toBeVisible();

  const reviewCards = reviewColumn.getByTestId("kanban-card");
  const secondReviewCard = reviewCards.nth(1);
  const secondReviewTitle = await secondReviewCard.getByRole("heading").innerText();
  const secondReviewHandle = secondReviewCard.getByRole("button", { name: /Drag/ });
  await secondReviewHandle.focus();
  await secondReviewHandle.press("Space");
  await expect(secondReviewHandle).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(100);
  await secondReviewHandle.press("ArrowUp");
  await page.waitForTimeout(100);
  await secondReviewHandle.press("Space");
  await expect(reviewCards.nth(0).getByRole("heading")).toHaveText(secondReviewTitle);

  const recapCard = reviewColumn.getByTestId("kanban-card").filter({
    hasText: "Prepare polished launch recap",
  });
  await recapCard.click();
  await page.getByRole("button", { name: "Delete card" }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(recapCard).toHaveCount(0);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Kanban board" })).toHaveCount(0);

  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Brainstorm" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("region", { name: "Kanban board" })).toHaveCount(0);
});

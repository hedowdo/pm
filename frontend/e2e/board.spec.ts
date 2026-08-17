import { expect, test, type Page } from "@playwright/test";
import { initialBoardState, moveCard, type BoardState } from "../src/lib/board";
import { CHAT_HISTORY_KEY, type ChatMessage } from "../src/lib/chat";

type ObservedChatRequest = {
  message: string;
  history: ChatMessage[];
};

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

async function installDeterministicChat(page: Page) {
  const observed: ObservedChatRequest[] = [];

  await page.route("**/api/chat", async (route) => {
    const request = route.request().postDataJSON() as ObservedChatRequest;
    observed.push(request);

    if (request.message === "Fail safely") {
      await route.fulfill({
        status: 503,
        json: { detail: "AI service is temporarily busy" },
      });
      return;
    }

    const boardUrl = new URL("/api/board", page.url()).toString();
    const currentResponse = await page.request.get(boardUrl);
    expect(currentResponse.ok()).toBe(true);
    let board = (await currentResponse.json()) as BoardState;
    let assistantMessage = "The board is ready.";
    const appliedOperations: Array<{
      type: "create_card" | "edit_card" | "move_card";
      cardId: string;
    }> = [];

    if (request.message === "Create an AI test card in To Do") {
      board = {
        ...board,
        cards: [
          ...board.cards,
          {
            id: "card-ai-created",
            title: "AI test card",
            details: "Created through the assistant.",
            columnId: "todo",
          },
        ],
      };
      assistantMessage = "I created the AI test card in To Do.";
      appliedOperations.push({ type: "create_card", cardId: "card-ai-created" });
    } else if (request.message === "Edit the project brief") {
      board = {
        ...board,
        cards: board.cards.map((card) =>
          card.id === "card-brief"
            ? { ...card, title: "AI revised project brief" }
            : card,
        ),
      };
      assistantMessage = "I revised the project brief.";
      appliedOperations.push({ type: "edit_card", cardId: "card-brief" });
    } else if (request.message === "Move the campaign story to Done") {
      board = moveCard(board, "card-story", "done");
      assistantMessage = "I moved the campaign story to Done.";
      appliedOperations.push({ type: "move_card", cardId: "card-story" });
    } else if (request.message === "Update two cards") {
      board = {
        ...board,
        cards: board.cards.map((card) => {
          if (card.id === "card-kickoff") {
            return { ...card, title: "Confirm project kickoff" };
          }
          if (card.id === "card-qa") {
            return { ...card, title: "Complete sign-up review" };
          }
          return card;
        }),
      };
      assistantMessage = "I updated both cards.";
      appliedOperations.push(
        { type: "edit_card", cardId: "card-kickoff" },
        { type: "edit_card", cardId: "card-qa" },
      );
    } else if (request.message === "Summarize this board") {
      assistantMessage = "Work is spread across all five stages.";
    }

    const savedResponse = await page.request.put(boardUrl, { data: board });
    expect(savedResponse.ok()).toBe(true);
    const authoritative = (await savedResponse.json()) as BoardState;

    await route.fulfill({
      status: 200,
      json: {
        message: assistantMessage,
        appliedOperations,
        board: authoritative,
      },
    });
  });

  return observed;
}

async function sendChatMessage(
  page: Page,
  message: string,
  expectedReply: string,
) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/chat") && response.request().method() === "POST",
  );
  const input = page.getByLabel("Message the board assistant");
  await input.fill(message);
  await page.getByRole("button", { name: "Send message" }).click();
  expect((await responsePromise).ok()).toBe(true);
  await expect(page.getByText(expectedReply)).toBeVisible();
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
  const observedChatRequests = await installDeterministicChat(page);

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

    await page.setViewportSize({ width: 1720, height: 900 });
    await expect(page.getByLabel("Message the board assistant")).toBeVisible();

    await sendChatMessage(
      page,
      "Create an AI test card in To Do",
      "I created the AI test card in To Do.",
    );
    await expect(page.getByTestId("column-todo").getByText("AI test card")).toBeVisible();
    expect(
      await page.evaluate((key) => window.sessionStorage.getItem(key), CHAT_HISTORY_KEY),
    ).not.toBeNull();

    await page.reload();
    await expect(page.getByTestId("column-todo").getByText("AI test card")).toBeVisible();
    await expect(page.getByText("I created the AI test card in To Do.")).toBeVisible();

    await sendChatMessage(
      page,
      "Edit the project brief",
      "I revised the project brief.",
    );
    await expect(page.getByText("AI revised project brief")).toBeVisible();

    await sendChatMessage(
      page,
      "Move the campaign story to Done",
      "I moved the campaign story to Done.",
    );
    await expect(
      page.getByTestId("column-done").getByText("Outline campaign story"),
    ).toBeVisible();

    await sendChatMessage(page, "Update two cards", "I updated both cards.");
    await expect(page.getByText("Confirm project kickoff")).toBeVisible();
    await expect(page.getByText("Complete sign-up review")).toBeVisible();

    await sendChatMessage(
      page,
      "Summarize this board",
      "Work is spread across all five stages.",
    );
    expect(observedChatRequests[0].history).toEqual([]);
    expect(observedChatRequests.at(-1)?.history).toEqual(
      expect.arrayContaining([
        { role: "user", content: "Create an AI test card in To Do" },
        {
          role: "assistant",
          content: "I created the AI test card in To Do.",
        },
      ]),
    );

    const beforeFailure = await page.evaluate(async () => {
      const response = await fetch("/api/board", { credentials: "same-origin" });
      return response.json() as Promise<BoardState>;
    });
    const failedResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/chat") && response.status() === 503,
    );
    await page.getByLabel("Message the board assistant").fill("Fail safely");
    await page.getByRole("button", { name: "Send message" }).click();
    await failedResponse;
    await expect(
      page
        .getByRole("complementary", { name: "AI assistant" })
        .getByRole("alert"),
    ).toHaveText("AI service is temporarily busy");
    await expect(page.getByLabel("Message the board assistant")).toHaveValue("Fail safely");
    const afterFailure = await page.evaluate(async () => {
      const response = await fetch("/api/board", { credentials: "same-origin" });
      return response.json() as Promise<BoardState>;
    });
    expect(afterFailure).toEqual(beforeFailure);

    await page.setViewportSize({ width: 390, height: 844 });
    const openChat = page.getByRole("button", { name: "Open AI chat" });
    await expect(openChat).toBeVisible();
    await openChat.click();
    await expect(page.getByRole("dialog", { name: "Plan with AI" })).toBeVisible();
    await expect(page.getByLabel("Message the board assistant")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Plan with AI" })).toHaveCount(0);
    await expect(openChat).toBeFocused();
  } finally {
    await replaceBoard(page, originalBoard);
  }

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("region", { name: "Kanban board" })).toHaveCount(0);
  expect(
    await page.evaluate((key) => window.sessionStorage.getItem(key), CHAT_HISTORY_KEY),
  ).toBeNull();
});

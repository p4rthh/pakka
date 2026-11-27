import { expect, test } from "@playwright/test";

test("demo script (b): household browses rice, rejects on price, corrects at read-back, gets a pakka bill", async ({ page }) => {
  await page.goto("/?speed=40");

  // No keys configured: the app still runs and says so.
  await expect(page.getByTestId("llm-status")).toContainText("key not set");

  await page.getByTestId("script-select").selectOption("b");
  await page.getByTestId("play-demo").click();
  await expect(page.getByTestId("demo-status")).toHaveText("finished", { timeout: 60_000 });

  // The stock card was raised by "rice mein kya kya hai?" and lists the rices.
  await expect(page.getByTestId("stock-card")).toContainText("Wada Kolam Rice");

  // Candidate states: Daawat rejected on price, Kolam confirmed at 10 kg after the read-back correction.
  const daawat = page.getByTestId("candidate-rice-daawat");
  await expect(daawat).toHaveAttribute("data-state", "rejected");
  await expect(daawat).toContainText("reason: price");
  const kolam = page.getByTestId("candidate-rice-kolam");
  await expect(kolam).toHaveAttribute("data-state", "confirmed");
  await expect(kolam).toContainText("10 kg");
  await expect(page.getByTestId("readback-text")).toHaveText(
    "Toh final: Kolam 10 kilo, Tata namak 1 packet, Fortune tel 1 litre. Sahi hai?",
  );

  // Nothing billed until the shopkeeper confirms.
  await expect(page.getByTestId("bill")).toHaveCount(0);
  await page.getByTestId("confirm").click();

  const bill = page.getByTestId("bill");
  await expect(bill).toBeVisible();
  const lines = page.getByTestId("bill-line");
  await expect(lines).toHaveCount(3);
  await expect(lines.nth(0)).toContainText("Wada Kolam Rice");
  await expect(lines.nth(0)).toContainText("₹620");
  await expect(lines.nth(1)).toContainText("Tata Salt");
  await expect(lines.nth(1)).toContainText("₹28");
  await expect(lines.nth(2)).toContainText("Fortune Sunlite Sunflower Oil");
  await expect(lines.nth(2)).toContainText("₹165");
  await expect(page.getByTestId("bill-total")).toHaveText("₹813");

  await expect(page.getByTestId("packing-slip")).toContainText("A2");
  const wa = page.getByTestId("whatsapp-link");
  await expect(wa).toHaveAttribute("href", /^https:\/\/wa\.me\/919867054321\?text=/);
});

test("typed lines go through the same engine, and confirm is blocked while a quantity is missing", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Type a line" }).click();
  await page.getByTestId("type-input").fill("Kolam de do");
  await page.getByTestId("type-input").press("Enter");
  await expect(page.getByTestId("candidate-rice-kolam")).toContainText("needs quantity");
  await page.getByTestId("confirm").click();
  await expect(page.getByTestId("issues")).toContainText("quantity not said");
  await page.getByTestId("type-input").fill("10 kilo");
  await page.getByTestId("type-input").press("Enter");
  await expect(page.getByTestId("candidate-rice-kolam")).toContainText("10 kg");
  await page.getByTestId("confirm").click();
  await expect(page.getByTestId("bill-total")).toHaveText("₹620");
});

test("API answers without keys and the telephony stub reports key not set", async ({ request }) => {
  const status = await (await request.get("/api/status")).json();
  expect(status.llm.configured).toBe(false);
  const tel = await request.post("/api/telephony/twilio", {
    form: { CallSid: "CA1", From: "+919820012345", To: "+912222222222", TranscriptionEvent: "transcription-content", Track: "inbound_track", TranscriptionData: JSON.stringify({ transcript: "Kolam 5 kilo", confidence: 0.9 }) },
  });
  expect(tel.status()).toBe(501);
  const body = await tel.json();
  expect(body.message).toContain("key not set");
  expect(body.parsed).toMatchObject({ kind: "transcript", speaker: "buyer", text: "Kolam 5 kilo" });
});

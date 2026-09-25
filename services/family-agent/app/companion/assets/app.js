const panels = [...document.querySelectorAll("[data-panel]")];
const tabs = [...document.querySelectorAll("[role=tab]")];
const message = document.querySelector("#message");
const codePanel = document.querySelector("#local-code");
const codeValue = document.querySelector("#local-code-value");
let pendingEmail = "";

function showPanel(name) {
  panels.forEach((panel) => { panel.hidden = panel.id !== name; });
  document.querySelector("#auth-tabs").hidden = !["sign-in", "sign-up"].includes(name);
  tabs.forEach((tab) => {
    const active = tab.dataset.show === name;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  codePanel.hidden = true;
  message.hidden = true;
}

function showMessage(text, kind = "") {
  message.textContent = text;
  message.className = `message ${kind}`.trim();
  message.hidden = false;
}

async function request(path, body) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || "Something went wrong. Please try again.");
  }
  return payload.data;
}

async function loadLocalCode(email, purpose) {
  codePanel.hidden = true;
  const params = new URLSearchParams({ email, purpose });
  try {
    const result = await request(`/v1/auth/dev-email/latest?${params}`);
    if (result?.code) {
      codeValue.textContent = result.code;
      codePanel.hidden = false;
    }
  } catch {
    // Production delivery is intentionally not wired into this local-only page.
  }
}

function showAccount(account) {
  showPanel("account");
  document.querySelector("#signed-in-household").textContent = account.householdName;
  document.querySelector("#signed-in-email").textContent = account.email;
}

document.querySelectorAll("[data-show]").forEach((button) => {
  button.addEventListener("click", () => showPanel(button.dataset.show));
});

document.querySelector("#sign-up").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries(form.entries());
  try {
    const result = await request("/v1/auth/sign-up", payload);
    pendingEmail = result.email;
    document.querySelector("#verify-address").textContent = pendingEmail;
    showPanel("verify-email");
    showMessage("Check your inbox for a verification code. You’ll sign in after verifying.");
    await loadLocalCode(pendingEmail, "verify_email");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

document.querySelector("#verify-email").addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = new FormData(event.currentTarget).get("code");
  try {
    const result = await request("/v1/auth/verify-email", { email: pendingEmail, code });
    showAccount(result.account);
    showMessage("Email verified. Your parent account is ready.", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

document.querySelector("#resend-code").addEventListener("click", async () => {
  try {
    await request("/v1/auth/resend-verification", { email: pendingEmail });
    showMessage("If that account needs verification, a new code has been sent.");
    await loadLocalCode(pendingEmail, "verify_email");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

document.querySelector("#sign-in").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    const result = await request("/v1/auth/sign-in", payload);
    showAccount(result.account);
    showMessage("You’re signed in.", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

document.querySelector("#forgot").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = new FormData(event.currentTarget).get("email");
  try {
    await request("/v1/auth/forgot-password", { email });
    pendingEmail = email.trim().toLowerCase();
    document.querySelector("#reset-address").textContent = pendingEmail;
    showPanel("reset-password");
    showMessage("If that account is eligible, a reset code has been sent.");
    await loadLocalCode(pendingEmail, "reset_password");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

document.querySelector("#reset-password").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await request("/v1/auth/reset-password", {
      email: pendingEmail,
      code: form.get("code"),
      newPassword: form.get("newPassword"),
    });
    showPanel("sign-in");
    showMessage("Password updated. Sign in with your new password.", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

document.querySelector("#sign-out").addEventListener("click", async () => {
  try {
    await request("/v1/auth/sign-out", {});
    showPanel("sign-in");
    showMessage("You’ve been signed out.", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

request("/v1/auth/session")
  .then((result) => result.authenticated ? showAccount(result.account) : showPanel("sign-in"))
  .catch(() => {
    showPanel("sign-in");
    showMessage("The account service is unavailable. Start the local FamilyOS API and reload.", "error");
  });

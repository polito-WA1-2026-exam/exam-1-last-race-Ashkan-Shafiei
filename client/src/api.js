const API_BASE = `${window.location.protocol}//${window.location.hostname}:3001/api`;

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (response.status === 204) {
    return null;
  }

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed.");
  }

  return payload;
}

export const api = {
  getCurrentUser: () => request("/sessions/current"),
  login: (username, password) =>
    request("/sessions", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request("/sessions/current", { method: "DELETE" }),
  getInstructions: () => request("/instructions"),
  getNetwork: () => request("/network"),
  startGame: () => request("/games", { method: "POST" }),
  submitRoute: (gameId, segmentIds) =>
    request(`/games/${gameId}/route`, {
      method: "POST",
      body: JSON.stringify({ segmentIds }),
    }),
  getRanking: () => request("/ranking"),
  getHistory: () => request("/games/history"),
};

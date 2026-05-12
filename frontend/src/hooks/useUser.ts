import { useEffect } from "react";
import { api } from "../api/client";

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function getDeviceId(): string {
  let id = localStorage.getItem("nav_device_id");
  if (!id) {
    id = generateUUID();
    localStorage.setItem("nav_device_id", id);
  }
  return id;
}

export function useUser() {
  useEffect(() => {
    const deviceId = getDeviceId();
    api.users.register(deviceId).catch(() => {});
  }, []);
}

"use client";

import { useState } from "react";
import { Badge, Box, Button, HStack, Input, Stack, Text } from "@chakra-ui/react";
import { useDashboard, when } from "@/components/dashboard-context";
import { GlassCard } from "@/components/dashboard-ui";

function csrf() {
  const item = document.cookie.split("; ").find(value => value.startsWith("warp_csrf="));
  return item ? decodeURIComponent(item.split("=").slice(1).join("=")) : "";
}

function ActionIcon({ kind }) {
  const paths = {
    rename: <><path d="m4 16-.8 4.8L8 20l11-11-4-4L4 16Z" /><path d="m13.5 6.5 4 4" /></>,
    activate: <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />,
    download: <><path d="M12 3v12m-5-5 5 5 5-5" /><path d="M5 18v3h14v-3" /></>,
    delete: <><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" /></>,
  };
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[kind]}</svg>;
}

export function SavedConfigsTable({ selectedId, onSelect }) {
  const { state } = useDashboard();
  const configs = [...(state?.saved_configs || [])].sort((a, b) => {
    const activeA = a.interface_public_key && a.interface_public_key === state?.config?.interface_public_key;
    const activeB = b.interface_public_key && b.interface_public_key === state?.config?.interface_public_key;
    return Number(activeB) - Number(activeA) || new Date(b.saved_at) - new Date(a.saved_at);
  });
  return <GlassCard p="3"><Stack gap="2">
    {configs.length ? configs.map(item => {
      const active = item.interface_public_key && item.interface_public_key === state?.config?.interface_public_key;
      return <Box key={item.id} role="button" tabIndex={0} aria-pressed={selectedId === item.id} cursor="pointer" onClick={() => onSelect(item.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(item.id); } }} p="3" rounded="xl" borderWidth="1px" borderColor={selectedId === item.id ? "cyan.300" : "whiteAlpha.200"} bg={selectedId === item.id || active ? "rgba(8,145,178,.16)" : "rgba(15,23,42,.4)"} _hover={{ bg: "rgba(8,145,178,.24)", borderColor: "cyan.400" }} _focusVisible={{ outline: "2px solid", outlineColor: "cyan.300" }}>
        <HStack justify="space-between" gap="2"><Text minW="0" whiteSpace="normal" color="gray.100" fontWeight="700">{item.name || "Untitled Config"}</Text>{active && <Badge colorPalette="cyan">Active</Badge>}</HStack>
        <Text color="gray.400" fontSize="xs" mt="1">{when(item.saved_at)}</Text>
      </Box>;
    }) : <Text color="gray.400" p="2">No saved configs yet.</Text>}
  </Stack></GlassCard>;
}

export function SavedConfigActions({ config, onDeleted }) {
  const { state, refresh, setError, setNotice } = useDashboard();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(config?.name || "Untitled Config");
  if (!config) return null;

  async function post(action, extra = {}) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/saved-configs", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() }, body: JSON.stringify({ archive_id: config.id, action, ...extra }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.message || "Could not update config");
      setNotice(data.message || "Saved."); await refresh();
      if (action === "rename") setEditing(false);
      if (action === "delete") onDeleted?.();
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }

  return <GlassCard p="4"><Text color="gray.400" fontSize="xs" fontWeight="700" letterSpacing=".08em">CONFIG ACTIONS</Text><HStack mt="3" gap="2" flexWrap="wrap">
    {editing ? <><Input aria-label="Config name" maxLength={64} value={name} onChange={event => setName(event.target.value)} w={{ base: "full", md: "240px" }} bg="rgba(2,6,23,.68)" borderColor="whiteAlpha.300" color="gray.100" /><Button bg="cyan.400" color="gray.950" _hover={{ bg: "cyan.300" }} loading={busy} onClick={() => post("rename", { name })}>Save name</Button><Button variant="outline" bg="rgba(15,23,42,.65)" color="gray.100" borderColor="whiteAlpha.300" _hover={{ bg: "whiteAlpha.200" }} onClick={() => setEditing(false)}>Cancel</Button></> : <Button variant="outline" bg="rgba(15,23,42,.65)" color="gray.100" borderColor="whiteAlpha.300" _hover={{ bg: "whiteAlpha.200" }} onClick={() => { setName(config.name || "Untitled Config"); setEditing(true); }}><ActionIcon kind="rename" /> Rename</Button>}
    <Button bg="cyan.400" color="gray.950" _hover={{ bg: "cyan.300" }} disabled={state?.status === "running"} loading={busy && state?.status === "running"} onClick={() => post("restore")}><ActionIcon kind="activate" /> Activate</Button>
    <Button asChild variant="outline" bg="rgba(15,23,42,.65)" color="gray.100" borderColor="whiteAlpha.300" _hover={{ bg: "whiteAlpha.200" }}><a href={`/api/saved-configs?archive_id=${encodeURIComponent(config.id)}`}><ActionIcon kind="download" /> Download</a></Button>
    <Button colorPalette="red" variant="outline" bg="rgba(69,10,10,.36)" color="red.100" borderColor="red.400" _hover={{ bg: "rgba(127,29,29,.55)" }} loading={busy} onClick={() => { if (window.confirm("Delete this saved config?")) post("delete"); }}><ActionIcon kind="delete" /> Delete</Button>
  </HStack></GlassCard>;
}

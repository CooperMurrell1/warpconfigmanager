"use client";

import { useState } from "react";
import { Badge, Box, Button, HStack, Input, Stack, Text } from "@chakra-ui/react";
import { useDashboard, when } from "@/components/dashboard-context";
import { GlassCard } from "@/components/dashboard-ui";

function csrf() {
  const item = document.cookie.split("; ").find(value => value.startsWith("warp_csrf="));
  return item ? decodeURIComponent(item.split("=").slice(1).join("=")) : "";
}

export function SavedConfigsTable({ selectedId, onSelect }) {
  const { state, refresh, setError, setNotice } = useDashboard();
  const [busy, setBusy] = useState("");
  const [editingId, setEditingId] = useState("");
  const [name, setName] = useState("");
  const configs = state?.saved_configs || [];
  const sorted = [...configs].sort((a, b) => {
    const activeA = a.interface_public_key && a.interface_public_key === state?.config?.interface_public_key;
    const activeB = b.interface_public_key && b.interface_public_key === state?.config?.interface_public_key;
    return Number(activeB) - Number(activeA) || new Date(b.saved_at) - new Date(a.saved_at);
  });

  async function action(id, actionName, extra = {}) {
    setBusy(id); setError("");
    try {
      const response = await fetch("/api/saved-configs", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() },
        body: JSON.stringify({ archive_id: id, action: actionName, ...extra }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.message || "Could not update saved config");
      setNotice(data.message || "Saved."); await refresh();
      if (actionName === "rename") setEditingId("");
    } catch (error) { setError(error.message); }
    finally { setBusy(""); }
  }

  return <GlassCard p={{ base: "3", md: "4" }}>
    <Stack gap="3">
      {sorted.length ? sorted.map(item => {
        const active = item.interface_public_key && item.interface_public_key === state?.config?.interface_public_key;
        const selected = selectedId === item.id;
        return <Box key={item.id} p="3" rounded="xl" borderWidth="1px" borderColor={selected ? "cyan.300" : "whiteAlpha.200"} bg={selected || active ? "rgba(8,145,178,.16)" : "rgba(15,23,42,.4)"} minW="0">
          <HStack justify="space-between" align="start" gap="2">
            {editingId === item.id ? <Input aria-label="Config name" autoFocus value={name} maxLength={64} onChange={event => setName(event.target.value)} size="sm" bg="rgba(2,6,23,.68)" borderColor="whiteAlpha.300" onKeyDown={event => { if (event.key === "Enter") action(item.id, "rename", { name }); if (event.key === "Escape") setEditingId(""); }} /> : <Button variant="ghost" color="gray.100" fontWeight="700" whiteSpace="normal" height="auto" p="0" textAlign="left" minW="0" onClick={() => onSelect?.(item.id)}>{item.name || "Untitled Config"}</Button>}
            {active && <Badge colorPalette="cyan" flexShrink="0">Active</Badge>}
          </HStack>
          <Text color="gray.400" fontSize="xs" mt="1">Saved {when(item.saved_at)}</Text>
          <HStack gap="2" mt="3" flexWrap="wrap">
            {editingId === item.id ? <><Button size="sm" bg="cyan.400" color="gray.950" loading={busy === item.id} onClick={() => action(item.id, "rename", { name })}>Save name</Button><Button size="sm" variant="outline" color="gray.100" onClick={() => setEditingId("")}>Cancel</Button></> : <Button size="sm" variant="outline" color="gray.100" onClick={() => { setEditingId(item.id); setName(item.name || "Untitled Config"); }}>Rename</Button>}
            <Button size="sm" bg="cyan.400" color="gray.950" loading={busy === item.id && state?.status === "running"} disabled={state?.status === "running"} onClick={() => { onSelect?.(item.id); action(item.id, "restore"); }}>Activate</Button>
            <Button asChild size="sm" variant="outline" color="gray.100" borderColor="whiteAlpha.300"><a href={`/api/saved-configs?archive_id=${encodeURIComponent(item.id)}`}>Download</a></Button>
            <Button size="sm" colorPalette="red" variant="outline" loading={busy === item.id} onClick={() => { if (window.confirm("Delete this saved config?")) action(item.id, "delete"); }}>Delete</Button>
          </HStack>
        </Box>;
      }) : <Text color="gray.300" p="2">No saved configs yet.</Text>}
    </Stack>
  </GlassCard>;
}

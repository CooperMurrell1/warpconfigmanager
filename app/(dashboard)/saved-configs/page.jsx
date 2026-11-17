"use client";

import { useState } from "react";
import { Button, HStack, Table, Text } from "@chakra-ui/react";
import { useDashboard, when } from "@/components/dashboard-context";
import { GlassCard, PageHeader } from "@/components/dashboard-ui";

function csrf() { const item = document.cookie.split("; ").find(v => v.startsWith("warp_csrf=")); return item ? decodeURIComponent(item.split("=").slice(1).join("=")) : ""; }

export default function SavedConfigsPage() {
  const { state, refresh, setError, setNotice } = useDashboard();
  const [busy, setBusy] = useState("");
  const configs = state?.saved_configs || [];
  async function remove(id) {
    if (!window.confirm("Delete this saved config?")) return;
    setBusy(id); setError("");
    try {
      const response = await fetch("/api/saved-configs", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() }, body: JSON.stringify({ archive_id: id }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not delete saved config");
      setNotice(data.message); await refresh();
    } catch (error) { setError(error.message); } finally { setBusy(""); }
  }
  async function restore(id) {
    if (!window.confirm("Activate this saved config in the VPN tunnel?")) return;
    setBusy(id); setError("");
    try {
      const response = await fetch("/api/saved-configs", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() }, body: JSON.stringify({ archive_id: id, action: "restore" }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not activate saved config");
      setNotice(data.message); await refresh();
    } catch (error) { setError(error.message); } finally { setBusy(""); }
  }
  return <>
    <PageHeader eyebrow="Archive" title="Saved configs" description="Successful configurations are kept privately for a limited time. Up to 20 versions are retained." />
    <GlassCard p={{ base: "3", md: "5" }}>
      {configs.length ? <Table.Root size="sm" variant="outline"><Table.Header><Table.Row><Table.ColumnHeader color="gray.300">Saved</Table.ColumnHeader><Table.ColumnHeader color="gray.300">File</Table.ColumnHeader><Table.ColumnHeader color="gray.300">Address</Table.ColumnHeader><Table.ColumnHeader color="gray.300">Endpoint</Table.ColumnHeader><Table.ColumnHeader color="gray.300">Expires</Table.ColumnHeader><Table.ColumnHeader color="gray.300">Actions</Table.ColumnHeader></Table.Row></Table.Header><Table.Body>{configs.map(item => <Table.Row key={item.id}><Table.Cell color="gray.200">{when(item.saved_at)}</Table.Cell><Table.Cell color="gray.200">{item.filename}</Table.Cell><Table.Cell color="gray.200">{item.address}</Table.Cell><Table.Cell color="gray.200">{item.endpoint}</Table.Cell><Table.Cell color="gray.400">{when(item.expires_at)}</Table.Cell><Table.Cell><HStack><Button size="xs" bg="cyan.400" color="gray.950" loading={busy === item.id} onClick={() => restore(item.id)}>Activate</Button><Button asChild size="xs" variant="outline" color="gray.100"><a href={`/api/saved-configs?archive_id=${encodeURIComponent(item.id)}`}>Download</a></Button><Button size="xs" colorPalette="red" variant="outline" loading={busy === item.id} onClick={() => remove(item.id)}>Delete</Button></HStack></Table.Cell></Table.Row>)}</Table.Body></Table.Root> : <Text color="gray.300" p="3">No saved configs yet. A config is archived after it activates successfully.</Text>}
    </GlassCard>
  </>;
}

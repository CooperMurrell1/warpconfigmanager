"use client";

import { useState } from "react";
import { Box, Button, HStack, Table, Text } from "@chakra-ui/react";
import { useDashboard, when } from "@/components/dashboard-context";
import { GlassCard, PageHeader } from "@/components/dashboard-ui";

function csrf() { const item = document.cookie.split("; ").find(v => v.startsWith("warp_csrf=")); return item ? decodeURIComponent(item.split("=").slice(1).join("=")) : ""; }

function ActionGlyph({ name }) {
  const paths = {
    activate: <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />,
    download: <><path d="M12 3v12m-5-5 5 5 5-5" /><path d="M5 18v3h14v-3" /></>,
    delete: <><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" /></>,
  };
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

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
    {state?.status === "running" && state?.generator_stage && <Text color="cyan.200" fontSize="sm" mb="4">{state.generator_stage}</Text>}
    <GlassCard p={{ base: "3", md: "5" }}>
      {configs.length ? <Box overflowX="auto" rounded="xl" borderWidth="1px" borderColor="whiteAlpha.200"><Table.Root size="sm" variant="outline" minW="850px"><Table.Header><Table.Row bg="whiteAlpha.100"><Table.ColumnHeader color="gray.300" py="4">Saved</Table.ColumnHeader><Table.ColumnHeader color="gray.300" py="4">File</Table.ColumnHeader><Table.ColumnHeader color="gray.300" py="4">WARP account</Table.ColumnHeader><Table.ColumnHeader color="gray.300" py="4">WARP device</Table.ColumnHeader><Table.ColumnHeader color="gray.300" py="4">Expires</Table.ColumnHeader><Table.ColumnHeader color="gray.300" py="4" textAlign="right">Actions</Table.ColumnHeader></Table.Row></Table.Header><Table.Body>{configs.map((item, index) => <Table.Row key={item.id} bg={index % 2 ? "whiteAlpha.50" : "transparent"} _hover={{ bg: "cyan.950" }} transition="background 120ms ease"><Table.Cell color="gray.200" whiteSpace="nowrap">{when(item.saved_at)}</Table.Cell><Table.Cell color="gray.100" fontWeight="700">{item.filename}</Table.Cell><Table.Cell><Text color="gray.100">{item.account_type || "WARP"}</Text><Text color="gray.400" fontSize="xs" fontFamily="mono">{item.account_id || "Account ID unavailable"}</Text><Text color="gray.500" fontSize="xs">Created {item.account_created_at ? when(item.account_created_at) : "unknown"}</Text></Table.Cell><Table.Cell><Text color="gray.200" fontSize="xs" fontFamily="mono" wordBreak="break-all">{item.device_id || "Device ID unavailable"}</Text></Table.Cell><Table.Cell color="gray.400" whiteSpace="nowrap">{when(item.expires_at)}<Text color="gray.500" fontSize="xs">Account: {when(item.account_expires_at)}</Text></Table.Cell><Table.Cell><HStack justify="end" gap="2"><Button aria-label="Activate saved config" title="Activate saved config" size="sm" minW="9" p="0" bg="cyan.400" color="gray.950" loading={busy === item.id} disabled={state?.status === "running"} onClick={() => restore(item.id)}><ActionGlyph name="activate" /></Button><Button asChild aria-label="Download saved config" title="Download saved config" size="sm" minW="9" p="0" variant="outline" color="gray.100" borderColor="whiteAlpha.300"><a href={`/api/saved-configs?archive_id=${encodeURIComponent(item.id)}`}><ActionGlyph name="download" /></a></Button><Button aria-label="Delete saved config" title="Delete saved config" size="sm" minW="9" p="0" colorPalette="red" variant="outline" loading={busy === item.id} onClick={() => remove(item.id)}><ActionGlyph name="delete" /></Button></HStack></Table.Cell></Table.Row>)}</Table.Body></Table.Root></Box> : <Text color="gray.300" p="3">No saved configs yet. A config is archived after it activates successfully.</Text>}
    </GlassCard>
  </>;
}

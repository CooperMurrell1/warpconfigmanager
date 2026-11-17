"use client";

import { useState } from "react";
import { Badge, Box, Button, HStack, Stack, Table, Text } from "@chakra-ui/react";
import { useDashboard, when } from "@/components/dashboard-context";
import { GlassCard } from "@/components/dashboard-ui";

function csrf() { const item = document.cookie.split("; ").find(v => v.startsWith("warp_csrf=")); return item ? decodeURIComponent(item.split("=").slice(1).join("=")) : ""; }

function ActionGlyph({ name }) {
  const paths = {
    activate: <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />,
    download: <><path d="M12 3v12m-5-5 5 5 5-5" /><path d="M5 18v3h14v-3" /></>,
    delete: <><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" /></>,
  };
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export function SavedConfigsTable({ selectedId, onSelect }) {
  const { state, refresh, setError, setNotice } = useDashboard();
  const [busy, setBusy] = useState("");
  const [sortMode, setSortMode] = useState("active");
  const configs = state?.saved_configs || [];
  const isActive = item => Boolean(item.interface_public_key && item.interface_public_key === state?.config?.interface_public_key);
  const sortedConfigs = [...configs].sort((a, b) => {
    const byDate = new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime();
    if (sortMode === "active" && isActive(a) !== isActive(b)) return isActive(a) ? -1 : 1;
    return sortMode === "oldest" ? -byDate : byDate;
  });
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
    onSelect?.(id);
    setBusy(id); setError("");
    try {
      const response = await fetch("/api/saved-configs", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() }, body: JSON.stringify({ archive_id: id, action: "restore" }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not activate saved config");
      setNotice(data.message); await refresh();
    } catch (error) { setError(error.message); } finally { setBusy(""); }
  }
  return <>
    <GlassCard p={{ base: "3", md: "5" }}>
      {configs.length ? <><Box mb="3" display="flex" justifyContent="end"><Box as="select" aria-label="Sort saved configs" value={sortMode} onChange={event => setSortMode(event.target.value)} px="3" py="2" rounded="lg" bg="#0b1424" color="gray.100" borderWidth="1px" borderColor="whiteAlpha.300"><option value="active">Active config first</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option></Box></Box><Stack display={{ base: "flex", "2xl": "none" }} gap="3">{sortedConfigs.map(item => <Box key={item.id} p="4" rounded="xl" borderWidth="1px" borderColor={selectedId === item.id ? "cyan.300" : "whiteAlpha.200"} bg={selectedId === item.id || isActive(item) ? "rgba(8,145,178,.16)" : "rgba(15,23,42,.4)"} minW="0"><HStack justify="space-between" align="start"><Box minW="0"><HStack flexWrap="wrap"><Button variant="ghost" color="gray.100" fontWeight="700" whiteSpace="normal" height="auto" p="0" textAlign="left" aria-pressed={selectedId === item.id} onClick={() => onSelect?.(item.id)}>{item.filename}</Button>{isActive(item) && <Badge colorPalette="cyan">Active</Badge>}</HStack><Text color="gray.400" fontSize="xs" mt="1">Saved {when(item.saved_at)}</Text></Box><Text color="gray.300" fontSize="xs" textAlign="right" wordBreak="break-all">{item.account_type || "WARP"}<br />{item.account_id || "Account ID unavailable"}</Text></HStack><Text color="gray.300" fontSize="xs" mt="3" overflowWrap="anywhere">Device: {item.device_id || "Not available"}</Text><HStack justify="end" mt="3"><Button aria-label="Activate saved config" title="Activate saved config" size="sm" minW="9" p="0" bg="cyan.400" color="gray.950" loading={busy === item.id} disabled={state?.status === "running"} onClick={() => restore(item.id)}><ActionGlyph name="activate" /></Button><Button asChild aria-label="Download saved config" title="Download saved config" size="sm" minW="9" p="0" variant="outline" color="gray.100" borderColor="whiteAlpha.300"><a href={`/api/saved-configs?archive_id=${encodeURIComponent(item.id)}`}><ActionGlyph name="download" /></a></Button><Button aria-label="Delete saved config" title="Delete saved config" size="sm" minW="9" p="0" colorPalette="red" variant="outline" loading={busy === item.id} onClick={() => remove(item.id)}><ActionGlyph name="delete" /></Button></HStack></Box>)}</Stack><Box display={{ base: "none", "2xl": "block" }} overflowX="auto" rounded="xl" borderWidth="1px" borderColor="whiteAlpha.200"><Table.Root size="sm" variant="outline" minW="760px"><Table.Header><Table.Row><Table.ColumnHeader py="4" style={{ backgroundColor: "#0b1424", color: "#a5f3fc", borderColor: "rgba(148,163,184,.18)" }}>Saved</Table.ColumnHeader><Table.ColumnHeader py="4" style={{ backgroundColor: "#0b1424", color: "#a5f3fc", borderColor: "rgba(148,163,184,.18)" }}>File</Table.ColumnHeader><Table.ColumnHeader py="4" style={{ backgroundColor: "#0b1424", color: "#a5f3fc", borderColor: "rgba(148,163,184,.18)" }}>WARP account</Table.ColumnHeader><Table.ColumnHeader py="4" style={{ backgroundColor: "#0b1424", color: "#a5f3fc", borderColor: "rgba(148,163,184,.18)" }}>WARP device</Table.ColumnHeader><Table.ColumnHeader py="4" style={{ backgroundColor: "#0b1424", color: "#a5f3fc", borderColor: "rgba(148,163,184,.18)" }}>Expires</Table.ColumnHeader><Table.ColumnHeader py="4" textAlign="right" style={{ backgroundColor: "#0b1424", color: "#a5f3fc", borderColor: "rgba(148,163,184,.18)" }}>Actions</Table.ColumnHeader></Table.Row></Table.Header><Table.Body>{sortedConfigs.map((item, index) => <Table.Row key={item.id} aria-selected={selectedId === item.id} tabIndex={0} cursor="pointer" onClick={() => onSelect?.(item.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect?.(item.id); } }} bg={selectedId === item.id ? "rgba(34,211,238,.22)" : isActive(item) ? "rgba(8,145,178,.16)" : index % 2 ? "whiteAlpha.50" : "transparent"} _hover={{ bg: "cyan.950" }} transition="background 120ms ease"><Table.Cell color="gray.200" whiteSpace="nowrap">{when(item.saved_at)}</Table.Cell><Table.Cell color="gray.100" fontWeight="700"><HStack>{item.filename}{isActive(item) && <Badge colorPalette="cyan">Active</Badge>}</HStack></Table.Cell><Table.Cell><Text color="gray.100">{item.account_type || "WARP"}</Text><Text color="gray.400" fontSize="xs" fontFamily="mono" wordBreak="break-all">{item.account_id || "Account ID unavailable"}</Text><Text color="gray.500" fontSize="xs">Created {item.account_created_at ? when(item.account_created_at) : "unknown"}</Text></Table.Cell><Table.Cell><Text color="gray.200" fontSize="xs" fontFamily="mono" wordBreak="break-all">{item.device_id || "Device ID unavailable"}</Text></Table.Cell><Table.Cell color="gray.400" whiteSpace="nowrap">{when(item.expires_at)}<Text color="gray.500" fontSize="xs">Account: {when(item.account_expires_at)}</Text></Table.Cell><Table.Cell><HStack justify="end" gap="2"><Button aria-label="Activate saved config" title="Activate saved config" size="sm" minW="9" p="0" bg="cyan.400" color="gray.950" loading={busy === item.id} disabled={state?.status === "running"} onClick={event => { event.stopPropagation(); restore(item.id); }}><ActionGlyph name="activate" /></Button><Button asChild aria-label="Download saved config" title="Download saved config" size="sm" minW="9" p="0" variant="outline" color="gray.100" borderColor="whiteAlpha.300"><a href={`/api/saved-configs?archive_id=${encodeURIComponent(item.id)}`} onClick={event => event.stopPropagation()}><ActionGlyph name="download" /></a></Button><Button aria-label="Delete saved config" title="Delete saved config" size="sm" minW="9" p="0" colorPalette="red" variant="outline" loading={busy === item.id} onClick={event => { event.stopPropagation(); remove(item.id); }}><ActionGlyph name="delete" /></Button></HStack></Table.Cell></Table.Row>)}</Table.Body></Table.Root></Box></> : <Text color="gray.300" p="3">No saved configs yet. A config is archived after it activates successfully.</Text>}
    </GlassCard>
  </>;
}

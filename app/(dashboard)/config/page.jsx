"use client";

import { Alert, Box, Button, Dialog, Heading, Input, Portal, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { useDashboard, when } from "@/components/dashboard-context";
import { Detail, GlassCard, PageHeader, StatusBadge } from "@/components/dashboard-ui";
import { SavedConfigActions, SavedConfigsTable } from "@/components/saved-configs-table";

export default function ConfigPage() {
  const { state, busy, post } = useDashboard();
  const [selectedId, setSelectedId] = useState(null);
  const [privateKey, setPrivateKey] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newConfigName, setNewConfigName] = useState("");
  const admin = state?.current_user_is_admin === true;
  const activeSaved = state?.saved_configs?.find(item => item.interface_public_key && item.interface_public_key === state?.config?.interface_public_key) || null;
  const selectedSaved = state?.saved_configs?.find(item => item.id === selectedId) || activeSaved;
  const selectedActive = !selectedSaved || Boolean(selectedSaved.interface_public_key && selectedSaved.interface_public_key === state?.config?.interface_public_key);
  const selectedStatus = selectedActive ? state?.status : selectedSaved?.last_status || "success";
  const selectedStatusAt = selectedActive
    ? selectedStatus === "success" ? state?.last_success_at : state?.last_attempt_at || state?.last_success_at
    : selectedSaved?.status_at || selectedSaved?.saved_at;
  const config = selectedSaved ? {
    address: selectedSaved.address,
    dns: selectedSaved.dns,
    mtu: selectedSaved.mtu,
    allowed_ips: selectedSaved.allowed_ips,
    endpoint: selectedSaved.endpoint,
    keepalive: selectedSaved.keepalive,
    interface_public_key: selectedSaved.interface_public_key,
  } : state?.config;
  const account = selectedSaved ? {
    account_type: selectedSaved.account_type,
    account_id: selectedSaved.account_id,
    device_id: selectedSaved.device_id,
    created_at: selectedSaved.account_created_at,
    expires_at: selectedSaved.account_expires_at,
  } : state?.warp_account;
  function nextConfigName() {
    const names = new Set((state?.saved_configs || []).map(item => (item.name || "").toLocaleLowerCase()));
    let number = 1;
    while (names.has(`untitled config (${number})`.toLocaleLowerCase())) number += 1;
    return `Untitled Config (${number})`;
  }
  async function addConfig() {
    const saved = await post("/api/update", { config_name: newConfigName }, "Config generation started.");
    if (saved) setAddOpen(false);
  }

  useEffect(() => {
    setPrivateKey("");
    setKeyError("");
  }, [selectedId]);

  useEffect(() => {
    if (!privateKey) return;
    const timer = window.setTimeout(() => setPrivateKey(""), 30000);
    return () => clearTimeout(timer);
  }, [privateKey]);

  async function loadPrivateKey() {
    const csrfItem = document.cookie.split("; ").find(value => value.startsWith("warp_csrf="));
    const csrf = csrfItem ? decodeURIComponent(csrfItem.split("=").slice(1).join("=")) : "";
    setKeyBusy(true);
    setKeyError("");
    try {
      const response = await fetch("/api/config-secret", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify(selectedSaved ? { archive_id: selectedSaved.id } : {}), cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load the private key");
      setPrivateKey(data.private_key);
    } catch (caught) {
      setKeyError(caught.message || "Could not load the private key");
    } finally {
      setKeyBusy(false);
    }
  }

  return <>
    <PageHeader eyebrow="WireGuard" title="Configuration" description="Select or add a config." action={<Button bg="cyan.400" color="gray.950" _hover={{ bg: "cyan.300" }} disabled={state?.status === "running" || !admin} onClick={() => { setNewConfigName(nextConfigName()); setAddOpen(true); }}>Add config</Button>} />
    {state?.status === "running" && state?.generator_stage && <GlassCard p="4" mb="5"><Text color="cyan.200" fontSize="sm">{state.generator_stage}</Text></GlassCard>}

    <SimpleGrid columns={{ base: 1, "2xl": 12 }} alignItems="start" gap="5">
      <Stack gap="5" minW="0" gridColumn={{ "2xl": "span 8" }}>
        <SimpleGrid columns={{ base: 1, md: 2 }} gap="4">
          <GlassCard p="5"><Detail label="Viewing config">{selectedSaved?.name || "Active config"}{selectedActive && <Text as="span" color="cyan.200" ml="2">Active</Text>}</Detail></GlassCard>
          <GlassCard p="5"><Text color="gray.400" fontSize="xs" fontWeight="700" letterSpacing="0.08em">CONFIG STATUS</Text><Box mt="2"><StatusBadge status={selectedStatus} /></Box><Text color="gray.400" fontSize="xs" mt="2">Last status update · {when(selectedStatusAt)}</Text></GlassCard>
        </SimpleGrid>
        {selectedSaved && <SavedConfigActions config={selectedSaved} onDeleted={() => setSelectedId(null)} />}

        <GlassCard p={{ base: "5", md: "6" }}>
          <Heading color="gray.50" size="md" mb="5">Interface and peer</Heading>
          {config ? <SimpleGrid columns={{ base: 1, lg: 2 }} gap="5" minW="0">
            <Detail label="Interface address">{config.address || "Not available"}</Detail>
            <Detail label="DNS">{config.dns || "Not specified"}</Detail>
            <Detail label="MTU">{config.mtu || "Default"}</Detail>
            <Detail label="Allowed IPs">{config.allowed_ips || "Not available"}</Detail>
            <Detail label="Endpoint">{config.endpoint || "Not available"}</Detail>
            <Detail label="Persistent keepalive">{config.keepalive ? `${config.keepalive} seconds` : "Disabled"}</Detail>
            <Detail label="Interface public key">{config.interface_public_key || "Not available"}</Detail>
          </SimpleGrid> : <Text color="red.200">No usable configuration is currently installed.</Text>}
        </GlassCard>

        <GlassCard p={{ base: "5", md: "6" }}>
          <Heading color="gray.50" size="md" mb="5">WARP service and account</Heading>
          <SimpleGrid columns={{ base: 1, lg: 2 }} gap="5" minW="0">
            <Detail label="Provider">{state?.warp_service?.provider || "Cloudflare WARP"}</Detail>
            <Detail label="Generator">{state?.warp_service?.generator || "wireguard-warp-generator"}</Detail>
            <Detail label="Generator version">{state?.warp_service?.generator_commit || "Not available"}</Detail>
            <Detail label="Account type">{account?.account_type || "Not collected"}</Detail>
            <Detail label="Account ID">{account?.account_id || "Not available"}</Detail>
            <Detail label="WARP device ID">{account?.device_id || "Not available"}</Detail>
            <Detail label="Account created">{account?.created_at ? when(account.created_at) : "Not available"}</Detail>
            <Detail label="Account expiry / TTL">{account?.expires_at ? when(account.expires_at) : "Not available"}</Detail>
            <Detail label="Registration endpoint">{state?.warp_service?.registration_endpoint || "Not available"}</Detail>
          </SimpleGrid>
          <Text color="gray.500" fontSize="xs" mt="5">Sensitive credentials are hidden.</Text>
        </GlassCard>

        <GlassCard p={{ base: "5", md: "6" }}>
          <Heading color="gray.50" size="md">Private key</Heading>
          <>
            <Text color="gray.400" fontSize="sm" mt="2">Admin only · hidden after 30 seconds.</Text>
            {keyError && <Text color="red.200" mt="4">{keyError}</Text>}
            {privateKey ? <Box mt="5">
              <Box tabIndex={0} role="textbox" aria-label="WireGuard private key; hover or focus to reveal" p="4" rounded="xl" bg="rgba(2, 6, 23, 0.7)" borderWidth="1px" borderColor="rgba(148, 163, 184, 0.2)" color="gray.100" fontFamily="mono" overflowWrap="anywhere" filter="blur(7px)" userSelect="none" transition="filter 160ms ease" _hover={{ filter: "blur(0)", userSelect: "text" }} _focus={{ filter: "blur(0)", userSelect: "text", outline: "2px solid", outlineColor: "cyan.400" }}>{privateKey}</Box>
              <Button mt="4" variant="outline" color="gray.100" borderColor="gray.600" onClick={() => setPrivateKey("")}>Hide key now</Button>
            </Box> : <Button mt="5" bg="cyan.400" color="gray.950" _hover={{ bg: "cyan.300" }} loading={keyBusy} disabled={!admin} onClick={loadPrivateKey}>Load private key</Button>}
          </>
        </GlassCard>

        <Alert.Root status="warning" rounded="2xl" bg="rgba(120, 53, 15, 0.48)" borderWidth="1px" borderColor="rgba(251, 146, 60, 0.25)" color="orange.50" p="5">
          <Alert.Indicator /><Box><Alert.Title>Routing and exit-IP warning</Alert.Title><Alert.Description color="orange.100" mt="1">Activating a different profile can change the public exit IP and routing. qBittorrentVPN and every running container that shares its network namespace will restart.</Alert.Description></Box>
        </Alert.Root>
      </Stack>

      <Stack gap="4" id="saved-configs" minW="0" gridColumn={{ "2xl": "span 4" }}>
        <Box><Heading color="gray.50" size="lg">Saved configs</Heading><Text color="gray.400" fontSize="sm" mt="2">Name and date for each saved version.</Text></Box>
        <SavedConfigsTable selectedId={selectedSaved?.id || null} onSelect={setSelectedId} />
      </Stack>
    </SimpleGrid>
    <Dialog.Root open={addOpen} onOpenChange={event => setAddOpen(event.open)}>
      <Portal><Dialog.Backdrop /><Dialog.Positioner><Dialog.Content bg="gray.900" color="gray.100" borderWidth="1px" borderColor="gray.700" rounded="2xl">
        <Dialog.Header><Dialog.Title>Add config</Dialog.Title></Dialog.Header>
        <Dialog.Body><Text color="gray.300" mb="3">Choose a name for the new generated config.</Text><Input autoFocus maxLength={64} value={newConfigName} onChange={event => setNewConfigName(event.target.value)} bg="rgba(2,6,23,.68)" borderColor="whiteAlpha.300" /></Dialog.Body>
        <Dialog.Footer><Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button><Button bg="cyan.400" color="gray.950" loading={busy} disabled={!newConfigName.trim()} onClick={addConfig}>Create config</Button></Dialog.Footer>
      </Dialog.Content></Dialog.Positioner></Portal>
    </Dialog.Root>
  </>;
}

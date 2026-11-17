"use client";

import { Alert, Box, Button, Heading, HStack, SimpleGrid, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { useDashboard, when } from "@/components/dashboard-context";
import { Detail, GlassCard, PageHeader, StatusBadge } from "@/components/dashboard-ui";

export default function ConfigPage() {
  const { state } = useDashboard();
  const config = state?.config;
  const [privateKey, setPrivateKey] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyError, setKeyError] = useState("");
  const admin = state?.current_user_is_admin === true;

  useEffect(() => {
    if (!privateKey) return;
    const timer = window.setTimeout(() => setPrivateKey(""), 30000);
    return () => window.clearTimeout(timer);
  }, [privateKey]);

  async function loadPrivateKey() {
    const csrfItem = document.cookie.split("; ").find(value => value.startsWith("warp_csrf="));
    const csrf = csrfItem ? decodeURIComponent(csrfItem.split("=").slice(1).join("=")) : "";
    setKeyBusy(true);
    setKeyError("");
    try {
      const response = await fetch("/api/config-secret", {
        method: "POST",
        headers: { "X-CSRF-Token": csrf },
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load the private key");
      setPrivateKey(data.private_key);
    } catch (caught) {
      setKeyError(caught.message || "Could not load the private key");
    } finally {
      setKeyBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="WireGuard"
        title="Current configuration"
        description="Configuration details from the currently installed WireGuard profile. Secret material is available only to Jellyfin administrators through an explicit, temporary reveal."
      />

      <SimpleGrid columns={{ base: 1, lg: 3 }} gap="5" mb="5">
        <GlassCard p="6"><Detail label="Selected file">{state?.config_filename || "wg0.conf"}</Detail></GlassCard>
        <GlassCard p="6"><Text color="gray.400" fontSize="xs" fontWeight="700" letterSpacing="0.08em">GENERATOR STATUS</Text><Box mt="2"><StatusBadge status={state?.status} /></Box></GlassCard>
        <GlassCard p="6"><Detail label="Last successful update">{when(state?.last_success_at)}</Detail></GlassCard>
      </SimpleGrid>

      <GlassCard p={{ base: "5", md: "7" }} mb="5">
        <Heading color="gray.50" size="md" mb="6">Interface and peer details</Heading>
        {config ? (
          <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} gap={{ base: "6", md: "8" }}>
            <Detail label="Interface address">{config.address}</Detail>
            <Detail label="DNS">{config.dns || "Not specified"}</Detail>
            <Detail label="MTU">{config.mtu || "Default"}</Detail>
            <Detail label="Allowed IPs">{config.allowed_ips}</Detail>
            <Detail label="Endpoint">{config.endpoint}</Detail>
            <Detail label="Persistent keepalive">{config.keepalive ? `${config.keepalive} seconds` : "Disabled"}</Detail>
          </SimpleGrid>
        ) : (
          <Text color="red.200">No usable configuration is currently installed.</Text>
        )}
      </GlassCard>

      <GlassCard p={{ base: "5", md: "7" }} mb="5">
        <Heading color="gray.50" size="md" mb="6">WARP service and account</Heading>
        <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} gap={{ base: "6", md: "8" }}>
          <Detail label="Provider">{state?.warp_service?.provider || "Cloudflare WARP"}</Detail>
          <Detail label="Generator">{state?.warp_service?.generator || "wireguard-warp-generator"}</Detail>
          <Detail label="Generator version">{state?.warp_service?.generator_commit || "Not available"}</Detail>
          <Detail label="WARP device type">{state?.warp_settings?.device_type || "Linux"}</Detail>
          <Detail label="Registration locale">{state?.warp_settings?.locale || "en_US"}</Detail>
          <Detail label="Registered device name">{state?.warp_settings?.device_name || "Not set"}</Detail>
          <Detail label="Registered device model">{state?.warp_settings?.device_model || "Not set"}</Detail>
          <Detail label="Account type">{state?.warp_account?.account_type || "Collected after next successful generation"}</Detail>
          <Detail label="Account ID">{state?.warp_account?.account_id || "Not collected yet"}</Detail>
          <Detail label="WARP device ID">{state?.warp_account?.device_id || "Not collected yet"}</Detail>
          <Detail label="Account created">{state?.warp_account?.created_at || "Not available"}</Detail>
          <Detail label="Account expiry / TTL">{state?.warp_account?.expires_at || "Not available"}</Detail>
          <Detail label="Account details collected">{when(state?.warp_account?.collected_at)}</Detail>
          <Detail label="Registration endpoint">{state?.warp_service?.registration_endpoint || "Not available"}</Detail>
        </SimpleGrid>
        <Text color="gray.500" fontSize="xs" mt="5">The account license value, API token, private key, and complete config are never stored in public state or displayed here.</Text>
      </GlassCard>

      <GlassCard p={{ base: "5", md: "7" }} mb="5">
        <Heading color="gray.50" size="md">Private key</Heading>
        <Text color="gray.400" fontSize="sm" mt="2">Administrator-only. The key is loaded on demand, cleared from this page after 30 seconds, and remains blurred until hovered or focused.</Text>
        {keyError && <Text color="red.200" mt="4">{keyError}</Text>}
        {privateKey ? (
          <Box mt="5">
            <Box
              tabIndex={0}
              role="textbox"
              aria-label="WireGuard private key; hover or focus to reveal"
              p="4"
              rounded="xl"
              bg="rgba(2, 6, 23, 0.7)"
              borderWidth="1px"
              borderColor="rgba(148, 163, 184, 0.2)"
              color="gray.100"
              fontFamily="mono"
              overflowWrap="anywhere"
              filter="blur(7px)"
              userSelect="none"
              transition="filter 160ms ease"
              _hover={{ filter: "blur(0)", userSelect: "text" }}
              _focus={{ filter: "blur(0)", userSelect: "text", outline: "2px solid", outlineColor: "cyan.400" }}
            >
              {privateKey}
            </Box>
            <HStack mt="4"><Button variant="outline" color="gray.100" borderColor="gray.600" onClick={() => setPrivateKey("")}>Hide key now</Button></HStack>
          </Box>
        ) : (
          <Button mt="5" bg="cyan.400" color="gray.950" _hover={{ bg: "cyan.300" }} loading={keyBusy} disabled={!admin} onClick={loadPrivateKey}>Load private key</Button>
        )}
      </GlassCard>

      <Alert.Root status="warning" rounded="2xl" bg="rgba(120, 53, 15, 0.48)" borderWidth="1px" borderColor="rgba(251, 146, 60, 0.25)" color="orange.50" p="5">
        <Alert.Indicator />
        <Box>
          <Alert.Title>Routing and exit-IP warning</Alert.Title>
          <Alert.Description color="orange.100" mt="1">
            Replacing this file can change the public exit IP and routing behavior. After a successful refresh, the manager restarts qBittorrentVPN and only the running services in the same Compose project that share its network namespace.
          </Alert.Description>
        </Box>
      </Alert.Root>
    </>
  );
}

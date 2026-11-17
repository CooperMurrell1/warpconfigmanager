"use client";

import { Alert, Box, Button, Field, Heading, Input, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard-context";
import { GlassCard, PageHeader } from "@/components/dashboard-ui";

export default function SettingsPage() {
  const { state, busy, post } = useDashboard();
  const [hours, setHours] = useState("24");
  const [filename, setFilename] = useState("wg0.conf");
  const [warpSettings, setWarpSettings] = useState({ device_type: "Linux", locale: "en_US", device_name: "", device_model: "" });
  const admin = state?.current_user_is_admin === true;

  useEffect(() => {
    if (!state) return;
    if (document.activeElement?.id !== "interval-hours") setHours(String(state.interval_seconds / 3600));
    if (document.activeElement?.id !== "config-filename") setFilename(state.config_filename || "wg0.conf");
    if (!document.activeElement?.closest("#warp-settings-form") && state.warp_settings) setWarpSettings(state.warp_settings);
  }, [state]);

  const intervalSeconds = Math.round(Number(hours) * 3600);
  const intervalValid = Number.isFinite(intervalSeconds) && intervalSeconds >= 300 && intervalSeconds <= 7776000;

  return (
    <>
      <PageHeader eyebrow="Preferences" title="Settings" description="Only operational settings that do not alter the generated WireGuard values are available here. Changes are persisted in SQLite." />

      <SimpleGrid columns={{ base: 1, xl: 2 }} gap="5">
        <GlassCard p={{ base: "5", md: "7" }}>
          <Heading color="gray.50" size="md" mb="2">Generation schedule</Heading>
          <Text color="gray.400" fontSize="sm" mb="6">Choose how often the manager checks in and generates a fresh configuration.</Text>
          <Stack gap="4">
            <Field.Root invalid={hours !== "" && !intervalValid}>
              <Field.Label color="gray.200">Interval in hours</Field.Label>
              <Input id="interval-hours" type="number" min="0.0834" max="2160" step="any" value={hours} onChange={event => setHours(event.target.value)} bg="rgba(2, 6, 23, 0.68)" borderColor="rgba(148, 163, 184, 0.24)" color="gray.50" _placeholder={{ color: "gray.500" }} />
              <Field.HelperText color="gray.400">Between 5 minutes and 90 days.</Field.HelperText>
              <Field.ErrorText>Enter an interval between 5 minutes and 90 days.</Field.ErrorText>
            </Field.Root>
            <Button alignSelf="start" bg="cyan.400" color="gray.950" _hover={{ bg: "cyan.300" }} loading={busy} disabled={!admin || !intervalValid} onClick={() => post("/api/interval", { interval_seconds: intervalSeconds }, "Update interval saved.")}>Save interval</Button>
          </Stack>
        </GlassCard>

        <GlassCard p={{ base: "5", md: "7" }}>
          <Heading color="gray.50" size="md" mb="2">Managed filename</Heading>
          <Text color="gray.400" fontSize="sm" mb="6">The default and recommended filename is wg0.conf.</Text>
          <Stack gap="4">
            <Field.Root>
              <Field.Label color="gray.200">WireGuard config filename</Field.Label>
              <Input id="config-filename" value={filename} onChange={event => setFilename(event.target.value)} placeholder="wg0.conf" bg="rgba(2, 6, 23, 0.68)" borderColor="rgba(148, 163, 184, 0.24)" color="gray.50" _placeholder={{ color: "gray.500" }} />
              <Field.HelperText color="gray.400">The selected file must already exist and contain a valid configuration before switching.</Field.HelperText>
            </Field.Root>
            <Alert.Root status="warning" rounded="xl" bg="rgba(120, 53, 15, 0.44)" color="orange.50"><Alert.Indicator /><Alert.Title>This changes the manager&apos;s target only. It does not change the VPN container&apos;s config path.</Alert.Title></Alert.Root>
            <Button alignSelf="start" bg="cyan.400" color="gray.950" _hover={{ bg: "cyan.300" }} loading={busy} disabled={!admin || !filename.trim()} onClick={() => post("/api/config-file", { config_filename: filename.trim() }, "Config filename saved.")}>Save filename</Button>
          </Stack>
        </GlassCard>
      </SimpleGrid>

      <GlassCard id="warp-settings-form" p={{ base: "5", md: "7" }} mt="5">
        <Heading color="gray.50" size="md" mb="2">WARP registration identity</Heading>
        <Text color="gray.400" fontSize="sm" mb="6">Choose how this device identifies itself when it registers with WARP. These values are stored in the manager database and apply to the next config generation.</Text>
        <SimpleGrid columns={{ base: 1, md: 2 }} gap="5">
          <Field.Root>
            <Field.Label color="gray.200">Device type</Field.Label>
            <Input value={warpSettings.device_type} onChange={event => setWarpSettings({ ...warpSettings, device_type: event.target.value })} placeholder="Linux" maxLength={32} bg="rgba(2, 6, 23, 0.68)" borderColor="rgba(148, 163, 184, 0.24)" color="gray.50" />
            <Field.HelperText color="gray.400">Sent as the WARP registration type (default: Linux).</Field.HelperText>
          </Field.Root>
          <Field.Root>
            <Field.Label color="gray.200">Locale</Field.Label>
            <Input value={warpSettings.locale} onChange={event => setWarpSettings({ ...warpSettings, locale: event.target.value })} placeholder="en_US" maxLength={20} bg="rgba(2, 6, 23, 0.68)" borderColor="rgba(148, 163, 184, 0.24)" color="gray.50" />
            <Field.HelperText color="gray.400">For example, en_US or en_GB.</Field.HelperText>
          </Field.Root>
          <Field.Root>
            <Field.Label color="gray.200">Device name</Field.Label>
            <Input value={warpSettings.device_name} onChange={event => setWarpSettings({ ...warpSettings, device_name: event.target.value })} placeholder="Optional" maxLength={64} bg="rgba(2, 6, 23, 0.68)" borderColor="rgba(148, 163, 184, 0.24)" color="gray.50" />
          </Field.Root>
          <Field.Root>
            <Field.Label color="gray.200">Device model</Field.Label>
            <Input value={warpSettings.device_model} onChange={event => setWarpSettings({ ...warpSettings, device_model: event.target.value })} placeholder="Optional" maxLength={64} bg="rgba(2, 6, 23, 0.68)" borderColor="rgba(148, 163, 184, 0.24)" color="gray.50" />
          </Field.Root>
        </SimpleGrid>
        <Button mt="5" bg="cyan.400" color="gray.950" _hover={{ bg: "cyan.300" }} loading={busy} disabled={!admin} onClick={() => post("/api/warp-settings", { warp_settings: warpSettings }, "WARP registration settings saved.")}>Save registration settings</Button>
      </GlassCard>

      <GlassCard p={{ base: "5", md: "7" }} mt="5">
        <Heading color="gray.50" size="md">Protected generator defaults</Heading>
        <Text color="gray.300" mt="3" maxW="4xl">DNS, MTU, allowed IPs, endpoint, keepalive, and key material remain controlled by the pinned generator. Only the WARP registration identity above is editable.</Text>
      </GlassCard>
    </>
  );
}

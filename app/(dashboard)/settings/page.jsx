"use client";

import { Alert, Box, Button, Field, Heading, Input, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard-context";
import { GlassCard, PageHeader } from "@/components/dashboard-ui";

export default function SettingsPage() {
  const { state, busy, post } = useDashboard();
  const [hours, setHours] = useState("24");
  const [filename, setFilename] = useState("wg0.conf");
  const admin = state?.current_user_is_admin === true;

  useEffect(() => {
    if (!state) return;
    if (document.activeElement?.id !== "interval-hours") setHours(String(state.interval_seconds / 3600));
    if (document.activeElement?.id !== "config-filename") setFilename(state.config_filename || "wg0.conf");
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

      <GlassCard p={{ base: "5", md: "7" }} mt="5">
        <Heading color="gray.50" size="md">Protected generator defaults</Heading>
        <Text color="gray.300" mt="3" maxW="4xl">DNS, MTU, allowed IPs, endpoint, keepalive, keys, and all other WireGuard values are intentionally not editable here. Generation continues to use the pinned upstream script and its defaults.</Text>
      </GlassCard>
    </>
  );
}

"use client";

import { Alert, Box, Button, Dialog, Field, Heading, Input, Portal, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard-context";
import { GlassCard, PageHeader } from "@/components/dashboard-ui";

const intervalUnits = { hours: 3600, days: 86400, weeks: 604800 };

function intervalDisplay(seconds) {
  if (seconds % intervalUnits.weeks === 0) return { value: String(seconds / intervalUnits.weeks), unit: "weeks" };
  if (seconds % intervalUnits.days === 0) return { value: String(seconds / intervalUnits.days), unit: "days" };
  return { value: String(seconds / intervalUnits.hours), unit: "hours" };
}

export default function SettingsPage() {
  const { state, busy, post } = useDashboard();
  const [intervalValue, setIntervalValue] = useState("24");
  const [intervalUnit, setIntervalUnit] = useState("hours");
  const [retentionValue, setRetentionValue] = useState("30");
  const [retentionUnit, setRetentionUnit] = useState("days");
  const [filename, setFilename] = useState("wg0.conf");
  const [filenameEditing, setFilenameEditing] = useState(false);
  const [confirmFilenameOpen, setConfirmFilenameOpen] = useState(false);
  const [warpSettings, setWarpSettings] = useState({ device_type: "Linux", locale: "en_US", device_name: "", device_model: "" });
  const admin = state?.current_user_is_admin === true;

  useEffect(() => {
    if (!state) return;
    const focusedId = document.activeElement?.id;
    if (focusedId !== "interval-value" && focusedId !== "interval-unit") {
      const display = intervalDisplay(state.interval_seconds);
      setIntervalValue(display.value);
      setIntervalUnit(display.unit);
    }
    if (!filenameEditing) setFilename(state.config_filename || "wg0.conf");
    const retention = intervalDisplay(state.config_retention_seconds || 30 * 86400);
    if (document.activeElement?.id !== "retention-value" && document.activeElement?.id !== "retention-unit") {
      setRetentionValue(retention.value); setRetentionUnit(retention.unit);
    }
    if (!document.activeElement?.closest("#warp-settings-form") && state.warp_settings) setWarpSettings(state.warp_settings);
  }, [state, filenameEditing]);

  const intervalSeconds = Math.round(Number(intervalValue) * intervalUnits[intervalUnit]);
  const retentionSeconds = Math.round(Number(retentionValue) * intervalUnits[retentionUnit]);
  const retentionValid = Number.isInteger(retentionSeconds) && retentionSeconds >= 3600 && retentionSeconds <= 365 * 86400;
  const intervalValid = Number.isFinite(intervalSeconds) && intervalSeconds >= 300 && intervalSeconds <= 7776000;

  async function confirmFilenameChange() {
    const saved = await post("/api/config-file", { config_filename: filename.trim() }, "Configuration file updated.");
    if (saved) {
      setConfirmFilenameOpen(false);
      setFilenameEditing(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Preferences" title="Settings" description="Choose when your config refreshes and how this device appears in WARP." />

      <SimpleGrid columns={{ base: 1, xl: 2 }} gap="5">
        <GlassCard p={{ base: "5", md: "7" }}>
          <Heading color="gray.50" size="md" mb="2">Update schedule</Heading>
          <Text color="gray.400" fontSize="sm" mb="6">Choose how often to create and apply a fresh configuration.</Text>
          <Stack gap="4">
            <Field.Root invalid={!intervalValid}>
              <Field.Label color="gray.200">Refresh every</Field.Label>
              <Stack direction={{ base: "column", sm: "row" }} gap="3">
                <Input id="interval-value" type="number" min="0.0001" step="any" value={intervalValue} onChange={event => setIntervalValue(event.target.value)} bg="rgba(2, 6, 23, 0.68)" borderColor="rgba(148, 163, 184, 0.24)" color="gray.50" _placeholder={{ color: "gray.500" }} />
                <Box as="select" id="interval-unit" value={intervalUnit} onChange={event => setIntervalUnit(event.target.value)} aria-label="Refresh interval unit" minW="32" h="10" px="3" rounded="md" bg="rgba(2, 6, 23, 0.92)" borderWidth="1px" borderColor="rgba(148, 163, 184, 0.24)" color="gray.50">
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                </Box>
              </Stack>
              <Field.HelperText color="gray.400">Choose hours, days, or weeks. The allowed range is 5 minutes to 90 days.</Field.HelperText>
              <Field.ErrorText>Enter a refresh interval between 5 minutes and 90 days.</Field.ErrorText>
            </Field.Root>
            <Button alignSelf="start" bg="cyan.400" color="gray.950" _hover={{ bg: "cyan.300" }} loading={busy} disabled={!admin || !intervalValid} onClick={() => post("/api/interval", { interval_seconds: intervalSeconds }, "Refresh schedule saved.")}>Save schedule</Button>
          </Stack>
        </GlassCard>

        <GlassCard p={{ base: "5", md: "7" }}>
          <Heading color="gray.50" size="md" mb="2">Configuration file</Heading>
          <Text color="gray.400" fontSize="sm" mb="6">This is the file the manager updates for your VPN.</Text>
          <Stack gap="4">
            <Field.Root>
              <Field.Label color="gray.200">Managed filename</Field.Label>
              <Input id="config-filename" value={filename} onChange={event => setFilename(event.target.value)} readOnly={!filenameEditing} placeholder="wg0.conf" bg="rgba(2, 6, 23, 0.68)" borderColor="rgba(148, 163, 184, 0.24)" color="gray.50" _readOnly={{ opacity: 0.82, cursor: "default" }} _placeholder={{ color: "gray.500" }} />
            </Field.Root>
            {filenameEditing ? (
              <Stack direction={{ base: "column", sm: "row" }} gap="3">
                <Button variant="outline" color="gray.100" borderColor="gray.600" disabled={busy} onClick={() => { setFilename(state?.config_filename || "wg0.conf"); setFilenameEditing(false); }}>Cancel</Button>
                <Button bg="cyan.400" color="gray.950" _hover={{ bg: "cyan.300" }} disabled={!admin || !filename.trim() || busy} onClick={() => setConfirmFilenameOpen(true)}>Save filename</Button>
              </Stack>
            ) : (
              <Button alignSelf="start" variant="outline" color="gray.100" borderColor="gray.600" disabled={!admin} onClick={() => setFilenameEditing(true)}>Edit filename</Button>
            )}
          </Stack>
        </GlassCard>
      </SimpleGrid>

      <GlassCard p={{ base: "5", md: "7" }} mt="5">
        <Heading color="gray.50" size="md" mb="2">Saved config retention</Heading>
        <Text color="gray.400" fontSize="sm" mb="5">Automatically delete archived configs after this period. The archive keeps at most 20 configs.</Text>
        <Stack direction={{ base: "column", sm: "row" }} gap="3" maxW="lg">
          <Input id="retention-value" type="number" min="1" step="1" value={retentionValue} onChange={event => setRetentionValue(event.target.value)} bg="rgba(2, 6, 23, 0.68)" borderColor="rgba(148, 163, 184, 0.24)" color="gray.50" />
          <Box as="select" id="retention-unit" value={retentionUnit} onChange={event => setRetentionUnit(event.target.value)} aria-label="Saved config retention unit" minW="32" h="10" px="3" rounded="md" bg="rgba(2, 6, 23, 0.92)" borderWidth="1px" borderColor="rgba(148, 163, 184, 0.24)" color="gray.50"><option value="hours">Hours</option><option value="days">Days</option><option value="weeks">Weeks</option></Box>
        </Stack>
        <Text color="gray.500" fontSize="xs" mt="2">Choose from 1 hour to 365 days.</Text>
        <Button mt="4" bg="cyan.400" color="gray.950" loading={busy} disabled={!admin || !retentionValid} onClick={() => post("/api/config-retention", { retention_seconds: retentionSeconds }, "Saved config retention updated.")}>Save retention</Button>
      </GlassCard>

      <GlassCard id="warp-settings-form" p={{ base: "5", md: "7" }} mt="5">
        <Heading color="gray.50" size="md" mb="2">WARP device details</Heading>
        <Text color="gray.400" fontSize="sm" mb="6">Choose the name and details shown for this device when it registers with WARP. Changes apply the next time a config is generated.</Text>
        <SimpleGrid columns={{ base: 1, md: 2 }} gap="5">
          <Field.Root>
            <Field.Label color="gray.200">Device type</Field.Label>
            <Input value={warpSettings.device_type} onChange={event => setWarpSettings({ ...warpSettings, device_type: event.target.value })} placeholder="Linux" maxLength={32} bg="rgba(2, 6, 23, 0.68)" borderColor="rgba(148, 163, 184, 0.24)" color="gray.50" />
            <Field.HelperText color="gray.400">Default: Linux.</Field.HelperText>
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
        <Button mt="5" bg="cyan.400" color="gray.950" _hover={{ bg: "cyan.300" }} loading={busy} disabled={!admin} onClick={() => post("/api/warp-settings", { warp_settings: warpSettings }, "WARP device details saved.")}>Save device details</Button>
      </GlassCard>

      <GlassCard p={{ base: "5", md: "7" }} mt="5">
        <Heading color="gray.50" size="md">Other settings</Heading>
        <Text color="gray.300" mt="3" maxW="4xl">DNS, routing, network ports, and key settings follow the pinned generator defaults and cannot be changed here.</Text>
      </GlassCard>

      <Dialog.Root open={confirmFilenameOpen} onOpenChange={event => setConfirmFilenameOpen(event.open)}>
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content bg="gray.900" color="gray.100" borderWidth="1px" borderColor="gray.700" rounded="2xl" boxShadow="0 24px 80px rgba(0,0,0,0.5)">
              <Dialog.Header><Dialog.Title>Are you sure?</Dialog.Title></Dialog.Header>
              <Dialog.Body>
                <Text>Change the managed filename to <strong>{filename.trim() || "(empty)"}</strong>?</Text>
                <Text color="gray.400" mt="3">The new file must already contain a valid WireGuard config. This changes the file the manager updates; it does not change the path used by your VPN container.</Text>
              </Dialog.Body>
              <Dialog.Footer>
                <Button variant="outline" color="gray.100" borderColor="gray.600" disabled={busy} onClick={() => setConfirmFilenameOpen(false)}>Go back</Button>
                <Button bg="cyan.400" color="gray.950" _hover={{ bg: "cyan.300" }} loading={busy} onClick={confirmFilenameChange}>Yes, change filename</Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  );
}

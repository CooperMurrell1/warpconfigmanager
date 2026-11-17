"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Box, Button, Dialog, Field, Heading, HStack, Input, Portal, SimpleGrid, Spinner, Stack, Text } from "@chakra-ui/react";
import { useDashboard } from "@/components/dashboard-context";
import { GlassCard, PageHeader } from "@/components/dashboard-ui";
import { DashboardTable } from "@/components/dashboard-table";

function csrf() {
  const item = document.cookie.split("; ").find(value => value.startsWith("warp_csrf="));
  return item ? decodeURIComponent(item.split("=").slice(1).join("=")) : "";
}

function formatDate(value) {
  if (!value) return "Never";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
}

function ActionIcon({ kind }) {
  const paths = {
    save: <><path d="M5 12.5 9.5 17 19 7.5" /></>,
    cancel: <><path d="m6 6 12 12M18 6 6 18" /></>,
    upload: <><path d="M12 16V4m-5 5 5-5 5 5" /><path d="M5 15v5h14v-5" /></>,
    delete: <><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" /></>,
    edit: <><path d="m4 16-.8 4.8L8 20l11-11-4-4L4 16Z" /><path d="m13.5 6.5 4 4" /></>,
  };
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[kind]}</svg>;
}

function UserPhoto({ user, version = 0, size = "12" }) {
  const [failedFor, setFailedFor] = useState("");
  const photoKey = `${user?.Id || "none"}-${user?.PrimaryImageTag || version}`;
  const failed = failedFor === photoKey;
  const initial = (user?.Name || "?").trim().slice(0, 1).toUpperCase();
  return <Box width={size} height={size} rounded="full" overflow="hidden" flexShrink="0" display="grid" placeItems="center" bg="rgba(8,145,178,.28)" borderWidth="1px" borderColor="rgba(103,232,249,.48)" color="cyan.100" fontWeight="800">
    {user && !failed ? <Box as="img" key={photoKey} src={`/api/users/${encodeURIComponent(user.Id)}/avatar?v=${encodeURIComponent(user.PrimaryImageTag || version)}`} alt={`${user.Name || "User"} profile`} width="100%" height="100%" objectFit="cover" onError={() => setFailedFor(photoKey)} /> : <Text>{initial}</Text>}
  </Box>;
}

function IconButton({ children, icon, ...props }) {
  return <Button {...props}><ActionIcon kind={icon} />{children}</Button>;
}

export default function AccountsPage() {
  const { state } = useDashboard();
  const [users, setUsers] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const avatarInput = useRef(null);

  const loadUsers = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch("/api/users", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load users");
      setUsers(data.users);
      setSelectedId(current => data.users.some(user => user.Id === current) ? current : data.users[0]?.Id || "");
      setError("");
    } catch (reason) {
      setError(reason.message || "Could not load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(true); }, [loadUsers]);

  const selected = users.find(user => user.Id === selectedId) || null;
  useEffect(() => {
    if (!selected) { setDraft(null); return; }
    setDraft({ name: selected.Name || "", role: selected.Role || (selected.IsAdministrator ? "admin" : "viewer"), isDisabled: selected.IsDisabled === true });
  }, [selected?.Id, selected?.Name, selected?.Role, selected?.IsAdministrator, selected?.IsDisabled]);

  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return users.filter(user => !needle || [user.Name, user.Id, user.Role, user.IsDisabled ? "disabled" : "enabled"]
      .some(value => String(value || "").toLocaleLowerCase().includes(needle)));
  }, [users, query]);

  const columns = useMemo(() => [
    { key: "Name", label: "User", sortValue: user => user.Name || "", render: user => <HStack gap="3"><UserPhoto user={user} size="9" /><Text color="gray.50" fontWeight="700">{user.Name || "Unnamed user"}</Text></HStack> },
    { key: "Role", label: "Role", sortValue: user => user.Role || "viewer", render: user => <Badge colorPalette={user.Role === "admin" ? "cyan" : user.Role === "readonly" ? "purple" : "gray"}>{user.Role === "admin" ? "Administrator" : user.Role === "readonly" ? "Read only" : "Viewer"}</Badge> },
    { key: "Status", label: "Status", sortValue: user => user.IsDisabled ? 0 : 1, render: user => <Text color={user.IsDisabled ? "orange.200" : "cyan.200"}>{user.IsDisabled ? "Disabled" : "Enabled"}</Text> },
    { key: "LastActivityDate", label: "Last active", sortValue: user => user.LastActivityDate || "", render: user => formatDate(user.LastActivityDate) },
  ], []);

  async function saveDetails() {
    if (!selected || !draft) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(selected.Id)}`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() },
        body: JSON.stringify({ action: "update", ...draft }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save account changes");
      await loadUsers();
      setNotice("Account details saved.");
    } catch (reason) { setError(reason.message || "Could not save account changes"); }
    finally { setSaving(false); }
  }

  async function uploadAvatar(file) {
    if (!selected || !file) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(selected.Id)}/avatar`, {
        method: "POST", headers: { "Content-Type": file.type, "X-CSRF-Token": csrf() }, body: file,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update the profile photo");
      setAvatarVersion(value => value + 1);
      await loadUsers();
      setNotice("Profile photo updated.");
    } catch (reason) { setError(reason.message || "Could not update the profile photo"); }
    finally { setSaving(false); if (avatarInput.current) avatarInput.current.value = ""; }
  }

  async function removeAvatar() {
    if (!selected) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(selected.Id)}/avatar`, { method: "DELETE", headers: { "X-CSRF-Token": csrf() } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not remove the profile photo");
      setAvatarVersion(value => value + 1);
      await loadUsers();
      setNotice("Profile photo removed.");
    } catch (reason) { setError(reason.message || "Could not remove the profile photo"); }
    finally { setSaving(false); }
  }

  async function deleteUser() {
    if (!selected) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(selected.Id)}`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() }, body: JSON.stringify({ action: "delete" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not delete this account");
      setDeleteOpen(false); setNotice(`${selected.Name} was deleted.`); setSelectedId("");
      await loadUsers();
    } catch (reason) { setError(reason.message || "Could not delete this account"); }
    finally { setSaving(false); }
  }

  function discardChanges() {
    if (!selected) return;
    setDraft({ name: selected.Name || "", role: selected.Role || (selected.IsAdministrator ? "admin" : "viewer"), isDisabled: selected.IsDisabled === true });
  }

  const isDirty = Boolean(selected && draft && (draft.name !== (selected.Name || "") || draft.role !== (selected.Role || (selected.IsAdministrator ? "admin" : "viewer")) || draft.isDisabled !== (selected.IsDisabled === true)));
  const isSelf = selected?.Id === state?.current_user_id;
  const buttonOutline = { variant: "outline", color: "gray.100", borderColor: "whiteAlpha.300", bg: "rgba(15,23,42,.55)", _hover: { bg: "whiteAlpha.100" } };

  return <>
    <PageHeader eyebrow="Administration" title="Accounts" description="Manage dashboard access and account details." />
    {error && <Alert.Root status="error" mb="5" rounded="xl" bg="rgba(127, 29, 29, 0.55)" color="red.50"><Alert.Indicator /><Alert.Title>{error}</Alert.Title></Alert.Root>}
    {notice && <Alert.Root status="success" mb="5" rounded="xl" bg="rgba(6, 78, 59, 0.55)" color="green.50"><Alert.Indicator /><Alert.Title>{notice}</Alert.Title></Alert.Root>}

    <SimpleGrid columns={{ base: 1, lg: 5 }} gap="5" alignItems="start">
      <GlassCard gridColumn={{ base: "auto", lg: "span 3" }} minW="0" p={{ base: "4", md: "6" }}>
        <HStack justify="space-between" align="center" mb="5" flexWrap="wrap" gap="3">
          <Box><Heading color="gray.50" size="md">All users</Heading><Text color="gray.300" fontSize="sm" mt="1">{filteredUsers.length} {filteredUsers.length === 1 ? "account" : "accounts"}</Text></Box>
          <Input aria-label="Search accounts" placeholder="Search users…" value={query} onChange={event => setQuery(event.target.value)} maxW={{ base: "full", sm: "64" }} bg="rgba(2, 6, 23, 0.68)" borderColor="rgba(148, 163, 184, 0.3)" color="gray.50" _placeholder={{ color: "gray.400" }} />
        </HStack>
        {loading ? <Box textAlign="center" py="10"><Spinner color="cyan.300" /><Text color="gray.300" mt="2">Loading users…</Text></Box> : <DashboardTable
          rows={filteredUsers}
          columns={columns}
          rowKey={user => user.Id}
          initialSort="Name"
          onRowClick={user => setSelectedId(user.Id)}
          selectedKey={selectedId}
          emptyMessage="No matching users."
        />}
      </GlassCard>

      <GlassCard gridColumn={{ base: "auto", lg: "span 2" }} minW="0" p={{ base: "5", md: "7" }}>
        {selected && draft ? <>
          <HStack align="center" gap="5" flexWrap="wrap" mb="6">
            <UserPhoto key={`${selected.Id}-${avatarVersion}`} user={selected} version={avatarVersion} size={{ base: "20", md: "24" }} />
            <Box flex="1" minW="0"><Text color="cyan.300" fontSize="xs" fontWeight="800" letterSpacing=".14em">ACCOUNT DETAILS</Text><Heading color="gray.50" size="lg" mt="1" overflowWrap="anywhere">{selected.Name}</Heading><Text color="gray.300" fontSize="sm" mt="1">Dashboard account and access</Text></Box>
          </HStack>

          <HStack gap="2" flexWrap="wrap" mb="6">
            <input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => uploadAvatar(event.target.files?.[0])} />
            <IconButton icon="upload" size="sm" {...buttonOutline} loading={saving} onClick={() => avatarInput.current?.click()}>Profile photo</IconButton>
            <IconButton icon="delete" size="sm" {...buttonOutline} disabled={saving || !selected.PrimaryImageTag} onClick={removeAvatar}>Remove photo</IconButton>
          </HStack>

          <Stack gap="5">
            <Field.Root required>
              <Field.Label color="gray.200">Display name</Field.Label>
              <Input value={draft.name} maxLength={128} onChange={event => setDraft(value => ({ ...value, name: event.target.value }))} bg="rgba(2, 6, 23, 0.68)" borderColor="rgba(148, 163, 184, 0.3)" color="gray.50" _placeholder={{ color: "gray.400" }} />
            </Field.Root>
            <SimpleGrid columns={{ base: 1, sm: 2 }} gap="4">
              <Field.Root>
                <Field.Label color="gray.200">Dashboard role</Field.Label>
                <Box as="select" aria-label="Dashboard role" value={draft.role} onChange={event => setDraft(value => ({ ...value, role: event.target.value }))} disabled={isSelf} h="10" px="3" rounded="md" bg="#0b1424" color="gray.100" borderWidth="1px" borderColor="whiteAlpha.300"><option value="viewer">Viewer · Home only</option><option value="readonly">Read only · All pages</option><option value="admin">Administrator</option></Box>
              </Field.Root>
              <Field.Root>
                <Field.Label color="gray.200">Account status</Field.Label>
                <Box as="select" aria-label="Account status" value={draft.isDisabled ? "disabled" : "enabled"} onChange={event => setDraft(value => ({ ...value, isDisabled: event.target.value === "disabled" }))} disabled={isSelf} h="10" px="3" rounded="md" bg="#0b1424" color="gray.100" borderWidth="1px" borderColor="whiteAlpha.300"><option value="enabled">Enabled</option><option value="disabled">Disabled</option></Box>
              </Field.Root>
            </SimpleGrid>

            <Box borderTopWidth="1px" borderColor="rgba(148, 163, 184, 0.18)" pt="4">
              <Heading color="gray.100" size="sm" mb="2">Sign in</Heading>
              <Text color="gray.300" fontSize="sm">Credentials are verified by Jellyfin at sign in. This dashboard does not store or change account passwords.</Text>
            </Box>

            <Box borderTopWidth="1px" borderColor="rgba(148, 163, 184, 0.18)" pt="4">
              <Heading color="gray.100" size="sm" mb="3">Account activity</Heading>
              <SimpleGrid columns={{ base: 1, sm: 2 }} gap="4">
                <Box><Text color="gray.400" fontSize="xs" fontWeight="700">ACCOUNT ID</Text><Text color="gray.200" mt="1" fontSize="sm" fontFamily="mono" overflowWrap="anywhere">{selected.Id}</Text></Box>
                <Box><Text color="gray.400" fontSize="xs" fontWeight="700">CREATED</Text><Text color="gray.200" mt="1" fontSize="sm">{formatDate(selected.DateCreated)}</Text></Box>
                <Box><Text color="gray.400" fontSize="xs" fontWeight="700">LAST SIGN IN</Text><Text color="gray.200" mt="1" fontSize="sm">{formatDate(selected.LastLoginDate)}</Text></Box>
                <Box><Text color="gray.400" fontSize="xs" fontWeight="700">LAST ACTIVE</Text><Text color="gray.200" mt="1" fontSize="sm">{formatDate(selected.LastActivityDate)}</Text></Box>
                <Box><Text color="gray.400" fontSize="xs" fontWeight="700">DASHBOARD ROLE</Text><Text color="gray.200" mt="1" fontSize="sm">{selected.Role === "admin" ? "Administrator" : selected.Role === "readonly" ? "Read only" : "Viewer"}</Text></Box>
              </SimpleGrid>
            </Box>

            <HStack borderTopWidth="1px" borderColor="rgba(148, 163, 184, 0.18)" pt="4" flexWrap="wrap" gap="2">
              <IconButton icon="save" bg="cyan.400" color="gray.950" _hover={{ bg: "cyan.300" }} loading={saving} disabled={!isDirty || !draft.name.trim()} onClick={saveDetails}>Save changes</IconButton>
              <IconButton icon="cancel" size="sm" {...buttonOutline} disabled={!isDirty || saving} onClick={discardChanges}>Discard</IconButton>
              <IconButton icon="delete" size="sm" variant="outline" color="red.100" borderColor="red.400" bg="rgba(69,10,10,.36)" _hover={{ bg: "rgba(127,29,29,.55)" }} loading={saving} disabled={isSelf} onClick={() => setDeleteOpen(true)}>Delete account</IconButton>
            </HStack>
          </Stack>
        </> : <Box py="8" textAlign="center"><Heading color="gray.100" size="md">Select a user</Heading><Text color="gray.400" mt="2">Choose an account from the table to view and edit its details.</Text></Box>}
      </GlassCard>
    </SimpleGrid>
    <Text color="gray.500" fontSize="sm" mt="5">This page only shows details used for dashboard access and account management.</Text>

    <Dialog.Root open={deleteOpen} onOpenChange={event => setDeleteOpen(event.open)}>
      <Portal><Dialog.Backdrop bg="blackAlpha.700" /><Dialog.Positioner><Dialog.Content bg="rgba(10,15,28,.96)" color="gray.100" borderWidth="1px" borderColor="rgba(248,113,113,.35)" rounded="2xl" backdropFilter="blur(24px)" boxShadow="0 24px 80px rgba(0,0,0,.55)">
        <Dialog.Header><Dialog.Title>Delete account?</Dialog.Title></Dialog.Header>
        <Dialog.Body><Text color="gray.300">This removes {selected?.Name || "this user"} from this dashboard. Their Jellyfin account and password are unchanged.</Text></Dialog.Body>
        <Dialog.Footer><Button {...buttonOutline} onClick={() => setDeleteOpen(false)}>Cancel</Button><Button color="red.50" bg="red.700" _hover={{ bg: "red.600" }} loading={saving} onClick={deleteUser}><ActionIcon kind="delete" />Delete account</Button></Dialog.Footer>
      </Dialog.Content></Dialog.Positioner></Portal>
    </Dialog.Root>
  </>;
}

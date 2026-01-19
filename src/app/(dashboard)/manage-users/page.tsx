"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession, authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Trash2,
  Key,
  UserPlus,
  Users,
  Shield,
  Loader2,
} from "lucide-react";
import { getEmailDomain } from "@/lib/utils";

interface User {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
  createdAt: string;
  banned: boolean | null;
}

export default function ManageUsersPage() {
  const { data: session, isPending: sessionPending } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Modal states
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] =
    useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [deleteUserConfirm, setDeleteUserConfirm] = useState<User | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form states for create user
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");

  // Form states for change password
  const [newPassword, setNewPassword] = useState("");

  // Check if current user is admin
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  // Get admin's org domain for filtering
  const orgDomain = useMemo(
    () => getEmailDomain(session?.user?.email || ""),
    [session?.user?.email]
  );

  const fetchUsers = useCallback(async () => {
    try {
      const response = await authClient.admin.listUsers({
        query: {
          limit: 100,
          sortBy: "createdAt",
          sortDirection: "desc",
        },
      });

      if (response.data?.users) {
        setUsers(response.data.users as User[]);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Failed to fetch users");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Redirect non-admins
    if (!sessionPending && session && !isAdmin) {
      router.push("/dashboard");
      return;
    }

    if (isAdmin) {
      fetchUsers();
    }
  }, [session, sessionPending, isAdmin, router, fetchUsers]);

  // Filter users to only show those in the same org (email domain)
  const orgUsers = useMemo(() => {
    if (!orgDomain) return [];
    return users.filter(
      (user) => getEmailDomain(user.email) === orgDomain
    );
  }, [users, orgDomain]);

  // Filter org users based on search
  const filteredUsers = useMemo(() => {
    if (!searchQuery) return orgUsers;
    return orgUsers.filter(
      (user) =>
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [orgUsers, searchQuery]);

  const resetCreateUserForm = () => {
    setNewUserEmail("");
    setNewUserName("");
    setNewUserPassword("");
  };

  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserPassword) {
      toast.error("Email and password are required");
      return;
    }

    // Validate that new user is in the same org (email domain)
    const newUserDomain = getEmailDomain(newUserEmail);
    if (newUserDomain !== orgDomain) {
      toast.error(`User email must end with @${orgDomain}`);
      return;
    }

    setIsSaving(true);
    try {
      const response = await authClient.admin.createUser({
        email: newUserEmail,
        password: newUserPassword,
        name: newUserName || newUserEmail.split("@")[0],
        role: "user",
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to create user");
      }

      await fetchUsers();
      setIsCreateUserModalOpen(false);
      resetCreateUserForm();
      toast.success("User created successfully");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create user"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!selectedUser || !newPassword) {
      toast.error("New password is required");
      return;
    }

    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    // Verify user is in the same org
    if (getEmailDomain(selectedUser.email) !== orgDomain) {
      toast.error("You can only change passwords for users in your organization");
      setIsChangePasswordModalOpen(false);
      setSelectedUser(null);
      setNewPassword("");
      return;
    }

    setIsSaving(true);
    try {
      const response = await authClient.admin.setUserPassword({
        userId: selectedUser.id,
        newPassword: newPassword,
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to change password");
      }

      setIsChangePasswordModalOpen(false);
      setSelectedUser(null);
      setNewPassword("");
      toast.success("Password changed successfully");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to change password"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserConfirm) return;

    // Prevent deleting yourself
    if (deleteUserConfirm.id === session?.user.id) {
      toast.error("You cannot delete your own account");
      setDeleteUserConfirm(null);
      return;
    }

    // Verify user is in the same org
    if (getEmailDomain(deleteUserConfirm.email) !== orgDomain) {
      toast.error("You can only delete users in your organization");
      setDeleteUserConfirm(null);
      return;
    }

    setIsDeleting(true);
    try {
      const response = await authClient.admin.removeUser({
        userId: deleteUserConfirm.id,
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to delete user");
      }

      await fetchUsers();
      toast.success("User deleted successfully");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete user"
      );
    } finally {
      setIsDeleting(false);
      setDeleteUserConfirm(null);
    }
  };

  const openChangePasswordModal = (user: User) => {
    setSelectedUser(user);
    setNewPassword("");
    setIsChangePasswordModalOpen(true);
  };

  if (sessionPending || (!isAdmin && session)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Users className="w-6 h-6" />
            Manage Users
          </h1>
          <p className="text-muted-foreground">
            Manage users in your organization ({orgDomain})
          </p>
        </div>
        <Button onClick={() => setIsCreateUserModalOpen(true)}>
          <UserPlus className="w-4 h-4 mr-2" />
          Create User
        </Button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            type="search"
          />
        </div>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Organization Users</CardTitle>
          <CardDescription>
            {filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""}{" "}
            in @{orgDomain}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              Loading users...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-8 text-center">
              <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground mb-4">No users found</p>
              <Button onClick={() => setIsCreateUserModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create First User
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.name || "—"}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      {user.role === "admin" ? (
                        <Badge className="bg-amber-500 hover:bg-amber-600 text-white">
                          <Shield className="w-3 h-3 mr-1" />
                          Admin
                        </Badge>
                      ) : (
                        <Badge variant="secondary">User</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(user.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openChangePasswordModal(user)}
                          title="Change password"
                        >
                          <Key className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteUserConfirm(user)}
                          disabled={user.id === session?.user.id}
                          title={
                            user.id === session?.user.id
                              ? "Cannot delete yourself"
                              : "Delete user"
                          }
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create User Modal */}
      <Dialog
        open={isCreateUserModalOpen}
        onOpenChange={setIsCreateUserModalOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>
              Create a new user account. They will be able to log in with these
              credentials.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="John Doe"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                type="name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder={`user@${orgDomain}`}
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Must end with @{orgDomain}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                placeholder="Minimum 8 characters"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateUserModalOpen(false);
                resetCreateUserForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateUser} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create User"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Modal */}
      <Dialog
        open={isChangePasswordModalOpen}
        onOpenChange={setIsChangePasswordModalOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Set a new password for {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password *</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="Minimum 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsChangePasswordModalOpen(false);
                setSelectedUser(null);
                setNewPassword("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleChangePassword} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Change Password"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation */}
      <AlertDialog
        open={!!deleteUserConfirm}
        onOpenChange={(open) => !open && setDeleteUserConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deleteUserConfirm?.email}? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

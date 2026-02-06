import { useEffect, useMemo, useState } from 'react';

interface UserRecord {
  id: string;
  username: string;
  role: 'admin' | 'user';
  created_at?: string;
}

interface UserAdminProps {
  token: string;
  apiBase: string;
}

function UserAdmin({ token, apiBase }: UserAdminProps) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', role: 'user' as 'user' | 'admin' });
  const [editingId, setEditingId] = useState<string | null>(null);

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }),
    [token]
  );

  const loadUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBase}/api/users`, { headers });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Failed to load users');
      }
      const data = (await response.json()) as { users: UserRecord[] };
      setUsers(data.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleSubmit = async () => {
    setError(null);
    const payload = {
      username: form.username.trim(),
      password: form.password,
      role: form.role
    };
    if (!payload.username || !payload.password || !payload.role) {
      setError('All fields are required.');
      return;
    }
    const response = await fetch(`${apiBase}/api/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const message = await response.text();
      setError(message || 'Failed to create user');
      return;
    }
    setForm({ username: '', password: '', role: 'user' });
    await loadUsers();
  };

  const handleDelete = async (id: string) => {
    const response = await fetch(`${apiBase}/api/users/${id}`, {
      method: 'DELETE',
      headers
    });
    if (!response.ok) {
      const message = await response.text();
      setError(message || 'Failed to delete user');
      return;
    }
    await loadUsers();
  };

  const startEdit = (user: UserRecord) => {
    setEditingId(user.id);
    setForm({ username: user.username, password: '', role: user.role });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ username: '', password: '', role: 'user' });
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    const payload = {
      username: form.username.trim(),
      role: form.role,
      ...(form.password ? { password: form.password } : {})
    };
    const response = await fetch(`${apiBase}/api/users/${editingId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const message = await response.text();
      setError(message || 'Failed to update user');
      return;
    }
    cancelEdit();
    await loadUsers();
  };

  return (
    <div className="panel admin-panel">
      <div className="admin-header">
        <h2>User access control</h2>
      </div>

      <div className="field-grid">
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={form.username}
            onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="text"
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
          />
        </label>
        <label className="field">
          <span>Role</span>
          <select
            value={form.role}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, role: event.target.value as 'admin' | 'user' }))
            }
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </label>
      </div>

      <div className="admin-actions">
        {editingId ? (
          <>
            <button className="button primary" type="button" onClick={handleUpdate}>
              Save changes
            </button>
            <button className="button" type="button" onClick={cancelEdit}>
              Cancel
            </button>
          </>
        ) : (
          <button className="button primary" type="button" onClick={handleSubmit}>
            Add user
          </button>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}
      {isLoading ? (
        <p className="muted">Loading users…</p>
      ) : (
        <div className="status-steps">
          {users.map((user) => (
            <div key={user.id} className="status-step">
              <div className="step-badge">{user.role === 'admin' ? 'A' : 'U'}</div>
              <div>
                <h4>{user.username}</h4>
                <p className="muted">Role: {user.role}</p>
              </div>
              <div className="admin-row-actions">
                <button className="button" type="button" onClick={() => startEdit(user)}>
                  Edit
                </button>
                <button className="button" type="button" onClick={() => handleDelete(user.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
          {!users.length && <p className="muted">No users yet.</p>}
        </div>
      )}
    </div>
  );
}

export default UserAdmin;

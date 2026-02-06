import { useState, type FormEvent } from 'react';

interface LoginFormProps {
  onLogin: (username: string, password: string) => Promise<void>;
  error?: string | null;
}

function LoginForm({ onLogin, error }: LoginFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await onLogin(username.trim(), password);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="upload-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>Email</span>
        <input
          type="email"
          placeholder="admin@example.com"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
        />
      </label>

      <label className="field">
        <span>Password</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>

      {error && <p className="form-error">{error}</p>}

      <button className="button primary" type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export default LoginForm;

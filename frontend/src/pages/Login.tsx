import { FormEvent, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button, Card, CardBody, Input } from '@heroui/react';
import { TrendingUp } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastContext';

const inputClassNames = {
  inputWrapper: 'bg-runway-charcoal border border-runway-border data-[hover=true]:bg-runway-charcoal',
  label: 'text-runway-muted',
};

export function Login() {
  const { login } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('demo.founder@runway.local');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      push('Welcome back.', 'success');
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-runway-bg px-4">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="w-8 h-8 rounded-md bg-runway-accent/15 flex items-center justify-center">
            <TrendingUp size={16} className="text-runway-accent" />
          </div>
          <span className="text-lg font-condensed font-bold tracking-wide text-runway-text">RUNWAY</span>
        </div>

        <Card className="bg-runway-surface border border-runway-border">
          <CardBody className="p-6 flex flex-col gap-4">
            <div>
              <h1 className="text-lg font-medium text-runway-text">Sign in</h1>
              <p className="text-sm text-runway-muted mt-0.5">Requires ENABLE_DATABASE=true on the API.</p>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <Input label="Email" type="email" size="sm" variant="bordered" value={email} onValueChange={setEmail} classNames={inputClassNames} isRequired />
              <Input label="Password" type="password" size="sm" variant="bordered" value={password} onValueChange={setPassword} classNames={inputClassNames} isRequired />
              {error && <p className="text-xs text-runway-negative">{error}</p>}
              <Button type="submit" color="primary" size="sm" isLoading={submitting} fullWidth>
                Sign in
              </Button>
            </form>
            <p className="text-xs text-runway-muted text-center">
              No account? <Link to="/signup" className="text-runway-accent">Sign up</Link>
            </p>
          </CardBody>
        </Card>

        <div className="mt-4 text-center">
          <button onClick={() => navigate('/')} className="text-xs text-runway-muted hover:text-runway-text underline underline-offset-2">
            Continue in demo mode instead →
          </button>
        </div>
      </motion.div>
    </div>
  );
}

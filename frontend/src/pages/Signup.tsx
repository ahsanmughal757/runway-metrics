import type { FormEvent} from 'react';
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button, Input } from '@heroui/react';
import { TrendingUp } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastContext';

const inputClassNames = {
  inputWrapper:
    'bg-white/[0.02] border border-runway-border/70 data-[hover=true]:bg-white/[0.03] rounded-xl shadow-soft',
  label: 'text-runway-muted',
};

export function Signup() {
  const { register } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await register({ email, password, name: name || undefined, companyName });
      push('Account created.', 'success');
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -left-24 w-[28rem] h-[28rem] rounded-full bg-runway-accent/[0.1] blur-[110px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 w-[28rem] h-[28rem] rounded-full bg-runway-accent2/[0.08] blur-[120px]" />
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="relative w-full max-w-sm">
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-9 h-9 rounded-xl bg-accent-gradient flex items-center justify-center shadow-glow">
            <TrendingUp size={17} className="text-white" />
          </div>
          <span className="text-lg font-condensed font-bold tracking-wide text-runway-text">RUNWAY</span>
        </div>

        <div className="runway-card p-6">
          <div className="runway-sheen" />
          <div className="relative flex flex-col gap-4">
            <div>
              <h1 className="text-lg font-semibold text-runway-text">Create an account</h1>
              <p className="text-sm text-runway-muted mt-0.5">You will be the owner of the company you create.</p>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <Input label="Your name" size="sm" variant="bordered" value={name} onValueChange={setName} classNames={inputClassNames} />
              <Input
                label="Company"
                size="sm"
                variant="bordered"
                value={companyName}
                onValueChange={setCompanyName}
                classNames={inputClassNames}
                isRequired
                description="The workspace you will own. You can invite teammates once you are in."
              />
              <Input label="Email" type="email" size="sm" variant="bordered" value={email} onValueChange={setEmail} classNames={inputClassNames} isRequired />
              <Input label="Password" type="password" size="sm" variant="bordered" value={password} onValueChange={setPassword} classNames={inputClassNames} isRequired minLength={8} description="Minimum 8 characters" />
              {error && <p className="text-xs text-runway-negative">{error}</p>}
              <Button type="submit" color="primary" size="sm" isLoading={submitting} fullWidth className="bg-accent-gradient font-medium">
                Create account
              </Button>
            </form>
            <p className="text-xs text-runway-muted text-center">
              Already have an account? <Link to="/login" className="text-runway-accent font-medium">Sign in</Link>
            </p>
          </div>
        </div>

        <div className="mt-4 text-center">
          <button onClick={() => navigate('/')} className="text-xs text-runway-muted hover:text-runway-text underline underline-offset-2">
            Continue in demo mode instead →
          </button>
        </div>
      </motion.div>
    </div>
  );
}

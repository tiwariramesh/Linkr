import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import z from 'zod';
import { useContext, useState } from 'react';
import { StoreContext } from '@/store/storeContext';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../components/ui/form';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Auth } from '@/layouts/Auth.tsx';
import { Spinner } from '@/components/ui/spinner.tsx';

const formSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, { message: 'Username must be at least 3 characters' })
      .max(32, { message: 'Username must be at most 32 characters' })
      .regex(/^[a-zA-Z0-9_.]+$/, { message: 'Use only letters, numbers, dots and underscores' }),
    email: z.email({ message: 'Enter a valid email address' }),
    password: z.string().min(8, { message: 'Password must be at least 8 characters' }),
    confirm_password: z.string(),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords don't match",
    path: ['confirm_password'],
  });

type FormValues = z.infer<typeof formSchema>;

const fields: { name: keyof FormValues; label: string; type: string; autoComplete: string; placeholder: string }[] = [
  { name: 'username', label: 'Username', type: 'text', autoComplete: 'username', placeholder: 'e.g. ramesh' },
  { name: 'email', label: 'Email', type: 'email', autoComplete: 'email', placeholder: 'you@example.com' },
  {
    name: 'password',
    label: 'Password',
    type: 'password',
    autoComplete: 'new-password',
    placeholder: 'At least 8 characters',
  },
  {
    name: 'confirm_password',
    label: 'Confirm password',
    type: 'password',
    autoComplete: 'new-password',
    placeholder: 'Type it again',
  },
];

export const Register = observer(() => {
  const store = useContext(StoreContext);
  const navigate = useNavigate();
  const [justRegistered, setJustRegistered] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { username: '', email: '', password: '', confirm_password: '' },
  });

  if (store.user && !justRegistered) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(values: FormValues) {
    setJustRegistered(true);
    const success = await store.register(values);
    if (success) {
      navigate('/setup/integrations', { replace: true });
    } else {
      setJustRegistered(false);
    }
  }

  const registrationClosed = store.appInfo?.registration_open === false;

  return (
    <Auth>
      <div className="w-full max-w-sm min-w-xs">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Create your account</CardTitle>
                <CardDescription>
                  {registrationClosed
                    ? 'Registration is closed on this Linkr server. Ask its owner for an account.'
                    : 'One account keeps your links and notes in sync on every device.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-5 pb-3 text-left">
                  {!registrationClosed &&
                    fields.map((field) => (
                      <FormField
                        key={field.name}
                        control={form.control}
                        name={field.name}
                        render={({ field: input }) => (
                          <FormItem className="gap-3">
                            <FormLabel>{field.label}</FormLabel>
                            <FormControl>
                              <Input
                                type={field.type}
                                autoComplete={field.autoComplete}
                                autoCapitalize="none"
                                placeholder={field.placeholder}
                                {...input}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ))}
                  {!registrationClosed && (
                    <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                      {form.formState.isSubmitting && <Spinner />}
                      Create account
                    </Button>
                  )}
                  <p className="text-muted-foreground text-center text-sm">
                    Already have an account?{' '}
                    <Link to="/login" className="text-foreground font-medium underline underline-offset-4">
                      Sign in
                    </Link>
                  </p>
                </div>
              </CardContent>
            </Card>
          </form>
        </Form>
      </div>
    </Auth>
  );
});

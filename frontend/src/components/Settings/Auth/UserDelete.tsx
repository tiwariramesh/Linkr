'use client';

import { Button } from '@/components/ui/button.tsx';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { Spinner } from '@/components/ui/spinner.tsx';
import { type FormEvent, useContext, useState } from 'react';
import { StoreContext } from '@/store/storeContext.ts';

export function UserDelete() {
  const store = useContext(StoreContext);
  const [password, setPassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const onConfirm = async (event: FormEvent) => {
    event.preventDefault();
    setIsDeleting(true);
    await store.deleteAccount({ password });
    setIsDeleting(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Delete Account</CardTitle>
        <CardDescription>
          Permanently deletes your account with all your links, notes and tags. This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <AlertDialog onOpenChange={() => setPassword('')}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="w-full">
              Delete Account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <form onSubmit={onConfirm} className="flex flex-col gap-4">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  Everything you saved in Linkr will be deleted on every device. Enter your password to confirm.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex flex-col gap-2">
                <Label htmlFor="delete-account-password">Password</Label>
                <Input
                  id="delete-account-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
                <Button type="submit" variant="destructive" disabled={!password || isDeleting}>
                  {isDeleting && <Spinner />}
                  Delete forever
                </Button>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}

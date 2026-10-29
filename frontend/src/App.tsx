import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { useContext, useEffect } from 'react';
import { StoreContext } from './store/storeContext';
import { Login } from './pages/Login.tsx';
import { Register } from './pages/Register.tsx';
import { SetupImport } from './pages/SetupImport.tsx';
import { SetupIntegrations } from './pages/SetupIntegrations.tsx';
import { Toaster } from './components/ui/sonner';
import { NotFound } from './layouts/NotFound.tsx';
import { RouterProvider } from 'react-router';
import { Spinner } from '@/components/ui/spinner.tsx';
import { ItemList } from '@/pages/ItemList.tsx';
import { CreateItem } from '@/pages/CreateItem.tsx';
import { EditItem } from '@/pages/EditItem.tsx';

const InitMiddleware = observer(() => {
  const store = useContext(StoreContext);

  useEffect(() => {
    // A 401 marks auth as required; any other failure (e.g. server unreachable) also lands on the sign-in page.
    const loadData = async () => {
      const signedIn = await store.getUser(true);
      if (!signedIn && store.isAuthRequired === null) {
        store.setIsAuthRequired(true);
      }
    };
    loadData();
  }, [store]);

  if (store.isAuthRequired === null) {
    return (
      <div className="bg-background flex h-full min-h-screen w-full flex-col items-center justify-center">
        <Spinner className="h-10 w-10" />
      </div>
    );
  }

  return (
    <>
      <Outlet />
      <Toaster />
    </>
  );
});

const AuthMiddleware = observer(() => {
  const store = useContext(StoreContext);
  const location = useLocation();

  if (store.isAuthRequired) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
});

const router = createBrowserRouter([
  {
    element: <InitMiddleware />,
    children: [
      { path: '/login', element: <Login /> },
      { path: '/register', element: <Register /> },
      {
        element: <AuthMiddleware />,
        children: [
          { path: '/', element: <ItemList /> },
          { path: '/setup/import', element: <SetupImport /> },
          { path: '/setup/integrations', element: <SetupIntegrations /> },
          { path: '/create-item', element: <CreateItem /> },
          { path: '/edit-item/:itemID', element: <EditItem /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFound /> },
]);

export const App = () => {
  return <RouterProvider router={router} />;
};

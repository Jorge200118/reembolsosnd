import { fraunces, workSans } from "@/lib/empleado/tema";
import { ToastProvider } from "@/components/empleado/Toast";
import { InstallPrompt } from "@/components/empleado/InstallPrompt";
import "./carnet.css";

export default function EmpleadoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${fraunces.variable} ${workSans.variable} carnet`}>
      <ToastProvider>
        <div className="carnet-wrap">
          <InstallPrompt />
          {children}
        </div>
      </ToastProvider>
    </div>
  );
}

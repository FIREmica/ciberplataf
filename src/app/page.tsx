
"use client";

import { useState, useEffect, useRef } from "react";
import JSZip from 'jszip';
import Link from "next/link";
import { AppHeader } from "@/components/layout/header";
import { UrlInputForm, type UrlInputFormValues } from "@/components/url-input-form";
import { VulnerabilityReportDisplay } from "@/components/vulnerability-report-display";
import { AttackVectorsDisplay } from "@/components/attack-vectors-display";
import { RemediationPlaybooksDisplay } from "@/components/remediation-playbooks-display";
import { AnalysisSummaryCard } from "@/components/analysis-summary-card";
import { performAnalysisAction, exportAllFindingsAsJsonAction } from "./actions";
import type { AnalysisResult, RemediationPlaybook, VulnerabilityFinding, AttackVector } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Info, Download, ShieldCheck, LogIn, UserCheck, AlertTriangle, Database, ServerIcon, Briefcase, BarChart3, Zap, FileLock2, Globe, Sparkles, Unlock, Gamepad2, MessageCircle, Code, Cloud, SlidersHorizontal, Users, ShieldEllipsis, Bot, Check, ListChecks, SearchCode, Network, BoxIcon, LibraryIcon, GitBranch, Columns, AlertOctagon, Waypoints, FileJson, Wifi, ExternalLink, LockIcon, CreditCard, ShoppingCart, Loader2, Search, Lightbulb, Target, Users2, Award, MessageSquareText } from "lucide-react";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { ChatAssistant } from "@/components/chat-assistant";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

declare global {
  interface Window {
    paypal?: {
      Buttons?: (options: any) => ({
        render: (selector: string | HTMLElement) => Promise<void>;
        isEligible: () => boolean;
        close: () => Promise<void>;
      });
    };
  }
}

const PayPalSmartPaymentButtons = ({ onPaymentSuccess, onPaymentError, onPaymentCancel, onLoginRequired }: { onPaymentSuccess: (details: any) => void, onPaymentError: (err: any) => void, onPaymentCancel: () => void, onLoginRequired: () => void }) => {
  const paypalButtonsContainerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [isPayPalSDKReady, setIsPayPalSDKReady] = useState(false);
  const [payPalButtonInstance, setPayPalButtonInstance] = useState<any>(null);
  const { session, refreshUserProfile } = useAuth();

  useEffect(() => {
    const checkPayPalSDK = () => {
      if (typeof window !== 'undefined' && window.paypal && typeof window.paypal.Buttons === 'function') {
        setIsPayPalSDKReady(true);
      } else {
        setTimeout(checkPayPalSDK, 100);
      }
    };
    checkPayPalSDK();
  }, []);

  useEffect(() => {
    const BCPC = paypalButtonsContainerRef.current;

    if (!session) {
      if (BCPC) BCPC.innerHTML = '';
      if (payPalButtonInstance && typeof payPalButtonInstance.close === 'function') {
        payPalButtonInstance.close().catch((err: any) => console.error("Error closing PayPal buttons on session loss:", err));
      }
      setPayPalButtonInstance(null);
      return;
    }

    if (isPayPalSDKReady && BCPC && !payPalButtonInstance) {
      try {
        if (typeof window.paypal?.Buttons !== 'function') {
            toast({ variant: "destructive", title: "Error de SDK de PayPal", description: "Los componentes de botones de PayPal no están disponibles." });
            console.error("window.paypal.Buttons is not a function or not available.");
            return;
        }

        const buttonsInstance = window.paypal.Buttons({
          style: {
            layout: 'vertical',
            color: 'gold',
            shape: 'rect',
            label: 'pay',
          },
          createOrder: async () => {
            if (!session) {
                toast({ variant: "destructive", title: "Error de Autenticación", description: "Debe iniciar sesión para crear una orden de pago." });
                onLoginRequired();
                return Promise.reject(new Error("User not logged in"));
            }
            try {
              toast({ title: "Iniciando Pago", description: "Creando orden de pago segura con PayPal...", variant: "default" });
              const response = await fetch('/api/paypal/create-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderAmount: '10.00', currencyCode: 'USD' }),
              });
              const orderData = await response.json();
              if (!response.ok || orderData.error) {
                const errorMsg = orderData.error || 'Error desconocido del servidor al crear la orden.';
                toast({ variant: "destructive", title: "Error de Creación de Orden", description: `No se pudo iniciar el pago: ${errorMsg}` });
                onPaymentError(new Error(errorMsg));
                return Promise.reject(new Error(errorMsg));
              }
              toast({ title: "Orden Creada", description: `Redirigiendo a PayPal para completar el pago. OrderID: ${orderData.orderID}`, variant: "default" });
              return orderData.orderID;
            } catch (error: any) {
              toast({ variant: "destructive", title: "Error de Pago", description: `No se pudo conectar con el servidor de pagos: ${error.message}` });
              onPaymentError(error);
              return Promise.reject(error);
            }
          },
          onApprove: async (data: any, actions: any) => {
            toast({ title: "Pago Aprobado por Usuario", description: "Procesando la confirmación del pago con nuestro servidor...", variant: "default" });
            try {
              const response = await fetch('/api/paypal/capture-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderID: data.orderID }),
              });
              const captureData = await response.json();

              if (!response.ok || captureData.error) {
                const errorMsg = captureData.error || "No se pudo capturar el pago en el servidor.";
                toast({ variant: "destructive", title: "Error al Confirmar Pago", description: errorMsg });
                console.error("Error capturing order in backend:", captureData);
                onPaymentError(new Error(errorMsg));
              } else {
                 toast({ title: "¡Pago Confirmado Exitosamente!", description: `Orden ${captureData.orderID || data.orderID} completada. Actualizando estado de suscripción...`, variant: "default", duration: 7000 });
                 await refreshUserProfile();
                 onPaymentSuccess({ orderID: data.orderID, payerID: data.payerID, paymentID: captureData.paymentDetails?.id, captureDetails: captureData });
              }
            } catch (error: any) {
              toast({ variant: "destructive", title: "Error Post-Aprobación", description: `Hubo un problema al finalizar la activación Premium: ${error.message}` });
              onPaymentError(error);
            }
          },
          onError: (err: any) => {
            let userMessage = "Ocurrió un error con el sistema de PayPal. Por favor, intente de nuevo.";
             if (err && typeof err.message === 'string' && err.message.includes('Window closed')) {
                userMessage = "Ventana de pago cerrada por el usuario antes de completar.";
            } else if (err && err.message && typeof err.message === 'string') {
                 userMessage = err.message.substring(0, 250);
            }
            toast({ variant: "destructive", title: "Error de PayPal", description: userMessage });
            console.error("PayPal Buttons onError:", err);
            onPaymentError(err);
          },
          onCancel: (data: any) => {
            toast({ title: "Pago Cancelado", description: "El proceso de pago fue cancelado por el usuario.", variant: "default" });
            onPaymentCancel();
          },
        });
        
        if (paypalButtonsContainerRef.current) {
             paypalButtonsContainerRef.current.innerHTML = ''; 
             buttonsInstance.render(paypalButtonsContainerRef.current)
            .then(() => {
                setPayPalButtonInstance(buttonsInstance);
                console.log("PayPal Buttons rendered successfully.");
            })
            .catch((renderError: any) => {
              const errMsg = renderError && renderError.message && typeof renderError.message === 'string' ? renderError.message.substring(0, 250) : "Error desconocido al renderizar botones de PayPal.";
              toast({ variant: "destructive", title: "Error de Interfaz de Pago", description: `No se pudieron mostrar los botones de PayPal: ${errMsg}` });
              console.error("PayPal SDK .render() error:", renderError);
            });
        }
      } catch (error) {
        const initError = error as Error;
        toast({ variant: "destructive", title: "Error Crítico de SDK de PayPal", description: `No se pudo inicializar la interfaz de pago de PayPal: ${initError.message}` });
        console.error("Error initializing PayPal Buttons:", error);
      }
    }

    return () => {
      if (payPalButtonInstance && typeof payPalButtonInstance.close === 'function') {
        payPalButtonInstance.close().catch((err: any) => console.error("Error al cerrar botones de PayPal en cleanup:", err));
      }
    };
  }, [isPayPalSDKReady, session, onPaymentError, onPaymentSuccess, onPaymentCancel, toast, onLoginRequired, refreshUserProfile, payPalButtonInstance]);

  if (!isPayPalSDKReady) {
    return <div className="mt-4 text-center text-muted-foreground">Cargando opciones de pago... <Loader2 className="inline-block ml-2 h-4 w-4 animate-spin"/></div>;
  }

  if (!session) {
    return (
      <div className="mt-4 text-center">
        <p className="text-muted-foreground mb-2">Debe iniciar sesión para realizar un pago.</p>
        <Button onClick={onLoginRequired}>
          <LogIn className="mr-2 h-4 w-4" />
          Iniciar Sesión para Pagar
        </Button>
      </div>
    );
  }

  return <div ref={paypalButtonsContainerRef} className="mt-4 paypal-buttons-container min-h-[100px]"></div>;
};


export default function HomePage() {
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [jsonExportUrl, setJsonExportUrl] = useState<string | null>(null);
  const [submittedTargetDescription, setSubmittedTargetDescription] = useState<string>("");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const { session, isLoading: isLoadingAuth, isPremium, userProfile, signOut, refreshUserProfile } = useAuth();

  const exampleUrl = "http://testphp.vulnweb.com/userinfo.php";

  useEffect(() => {
    const currentZipUrl = zipUrl;
    const currentJsonUrl = jsonExportUrl;
    return () => {
      if (currentZipUrl) URL.revokeObjectURL(currentZipUrl);
      if (currentJsonUrl) URL.revokeObjectURL(currentJsonUrl);
    };
  }, [zipUrl, jsonExportUrl]);

  const generateZipFile = async (result: AnalysisResult, targetDesc: string) => {
    if (!result || (result.error && !result.reportText && (!result.allFindings || result.allFindings.length === 0))) return;

    const zip = new JSZip();
    const safeDesc = targetDesc.replace(/[^a-zA-Z0-9.-]/g, '_').substring(0, 50) || 'analisis';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const folderName = `analisis_seguridad_${safeDesc}_${timestamp}`;
    const folder = zip.folder(folderName);

    if (!folder) {
        toast({ variant: "destructive", title: "Error al Crear ZIP", description: "No se pudo crear la carpeta interna." });
        return;
    }

    folder.file("descripcion_analisis.txt", targetDesc);

    if (result.reportText) folder.file("informe_completo_seguridad.md", result.reportText);
    if (result.allFindings && result.allFindings.length > 0) {
      try {
        const allFindingsJson = await exportAllFindingsAsJsonAction(result.allFindings);
        folder.file("todos_los_hallazgos.json", allFindingsJson);
      } catch (e) { folder.file("error_exportando_hallazgos.txt", "No se pudieron exportar los hallazgos a JSON."); }
    }
    if (result.attackVectors && result.attackVectors.length > 0) {
      folder.file("vectores_ataque_ilustrativos.json", JSON.stringify(result.attackVectors, null, 2));
    }
    if (result.remediationPlaybooks && result.remediationPlaybooks.length > 0) {
        const playbooksFolder = folder.folder("playbooks_remediacion");
        if (playbooksFolder) {
            result.remediationPlaybooks.forEach((playbook, index) => {
                const safeTitle = playbook.playbookTitle.replace(/[^a-zA-Z0-9.-]/g, '_').substring(0, 40) || `playbook_${index}`;
                playbooksFolder.file(`${safeTitle}.md`, playbook.playbookMarkdown);
            });
        }
    }

    if (result.urlAnalysis?.executiveSummary) folder.file("resumen_url.txt", result.urlAnalysis.executiveSummary);
     if (result.serverAnalysis?.executiveSummary) folder.file("resumen_servidor.txt", result.serverAnalysis.executiveSummary);
     if (result.databaseAnalysis?.executiveSummary) folder.file("resumen_db.txt", result.databaseAnalysis.executiveSummary);
     if (result.sastAnalysis?.executiveSummary) folder.file("resumen_sast.txt", result.sastAnalysis.executiveSummary);
     if (result.dastAnalysis?.executiveSummary) folder.file("resumen_dast.txt", result.dastAnalysis.executiveSummary);
     if (result.cloudAnalysis?.executiveSummary) folder.file("resumen_cloud.txt", result.cloudAnalysis.executiveSummary);
     if (result.containerAnalysis?.executiveSummary) folder.file("resumen_container.txt", result.containerAnalysis.executiveSummary);
     if (result.dependencyAnalysis?.executiveSummary) folder.file("resumen_dependencies.txt", result.dependencyAnalysis.executiveSummary);
     if (result.networkAnalysis?.executiveSummary) folder.file("resumen_network.txt", result.networkAnalysis.executiveSummary);

    try {
      const blob = await zip.generateAsync({ type: "blob" });
      const newZipUrl = URL.createObjectURL(blob);
      if (zipUrl) URL.revokeObjectURL(zipUrl);
      setZipUrl(newZipUrl);
      toast({ title: "Archivo ZIP Listo", description: "El ZIP con los resultados está listo para descargar.", variant: "default" });
    } catch (error) {
      toast({ variant: "destructive", title: "Error al Generar ZIP", description: "Ocurrió un error." });
      setZipUrl(null);
    }
  };

  const generateJsonExportFile = async (findings: VulnerabilityFinding[], targetDesc: string) => {
    if (!findings || findings.length === 0) {
        toast({ variant: "default", title: "Sin Hallazgos", description: "No hay hallazgos para exportar en JSON." });
        return;
    }
    try {
        const jsonString = await exportAllFindingsAsJsonAction(findings);
        const blob = new Blob([jsonString], { type: "application/json" });
        const newJsonUrl = URL.createObjectURL(blob);
        if (jsonExportUrl) URL.revokeObjectURL(jsonExportUrl);
        setJsonExportUrl(newJsonUrl);
        toast({ title: "Archivo JSON Listo", description: "Los hallazgos están listos para descargar en formato JSON.", variant: "default" });
    } catch (error) {
        toast({ variant: "destructive", title: "Error al Generar JSON", description: "Ocurrió un error." });
        setJsonExportUrl(null);
    }
  };

  const handleFormSubmit = async (values: UrlInputFormValues) => {
    setIsLoadingAnalysis(true);
    setAnalysisResult(null);

    const descriptionParts = [];
    if (values.url) descriptionParts.push(`URL: ${values.url}`);
    if (values.serverDescription) descriptionParts.push("Servidor General");
    if (values.gameServerDescription) descriptionParts.push("Servidor de Juegos");
    if (values.databaseDescription) descriptionParts.push("Base de Datos");
    if (values.codeSnippet) descriptionParts.push("Análisis SAST");
    if (values.dastTargetUrl) descriptionParts.push(`Análisis DAST (${values.dastTargetUrl})`);
    if (values.cloudProvider && values.cloudConfigDescription) descriptionParts.push(`Cloud (${values.cloudProvider}${values.cloudRegion ? `/${values.cloudRegion}` : ''})`);
    if (values.containerImageName || values.dockerfileContent || values.kubernetesManifestContent) descriptionParts.push("Contenedores/K8s");
    if (values.dependencyFileType && values.dependencyFileContent) descriptionParts.push(`Dependencias (${values.dependencyFileType})`);
    if (values.networkDescription || values.networkScanResults || values.networkFirewallRules) descriptionParts.push('Red');

    const currentTargetDesc = descriptionParts.join(', ') || "Análisis General";
    setSubmittedTargetDescription(currentTargetDesc);

    if (zipUrl) { URL.revokeObjectURL(zipUrl); setZipUrl(null); }
    if (jsonExportUrl) { URL.revokeObjectURL(jsonExportUrl); setJsonExportUrl(null); }

    toast({
        title: "Iniciando Análisis Integral de Seguridad...",
        description: `Analizando: ${currentTargetDesc}. Este proceso puede tomar unos momentos.`,
        variant: "default",
    });

    try {
      const params: Parameters<typeof performAnalysisAction>[0] = {};
      if (values.url) params.url = values.url;
      let finalServerDescription = values.serverDescription || "";
      if (values.gameServerDescription) {
        finalServerDescription = finalServerDescription
          ? `${finalServerDescription}\n\n--- Detalles Específicos del Servidor de Juegos ---\n${values.gameServerDescription}`
          : values.gameServerDescription;
      }
      if (finalServerDescription) params.serverDescription = finalServerDescription;
      if (values.databaseDescription) params.databaseDescription = values.databaseDescription;
        if (values.codeSnippet) params.codeSnippet = values.codeSnippet;
        if (values.sastLanguage) params.sastLanguage = values.sastLanguage;
        if (values.dastTargetUrl) params.dastTargetUrl = values.dastTargetUrl;
        if (values.cloudProvider) params.cloudProvider = values.cloudProvider;
        if (values.cloudConfigDescription) params.cloudConfigDescription = values.cloudConfigDescription;
        if (values.cloudRegion) params.cloudRegion = values.cloudRegion;
        if (values.containerImageName) params.containerImageName = values.containerImageName;
        if (values.dockerfileContent) params.dockerfileContent = values.dockerfileContent;
        if (values.kubernetesManifestContent) params.kubernetesManifestContent = values.kubernetesManifestContent;
        if (values.containerAdditionalContext) params.containerAdditionalContext = values.containerAdditionalContext;
        if (values.dependencyFileContent) params.dependencyFileContent = values.dependencyFileContent;
        if (values.dependencyFileType) params.dependencyFileType = values.dependencyFileType;
        if (values.networkDescription) params.networkDescription = values.networkDescription;
        if (values.networkScanResults) params.networkScanResults = values.networkScanResults;
        if (values.networkFirewallRules) params.networkFirewallRules = values.networkFirewallRules;


      if (Object.keys(params).length === 0) {
        toast({ variant: "destructive", title: "Entrada Inválida", description: "Por favor, proporciona al menos un objetivo de análisis."});
        setIsLoadingAnalysis(false);
        return;
      }

      const result = await performAnalysisAction(params, isPremium); // isPremium from useAuth()
      setAnalysisResult(result);

      if (result.error && !result.reportText && (!result.allFindings || result.allFindings.length === 0 )) {
        toast({ variant: "destructive", title: "Análisis Fallido", description: result.error, duration: 8000 });
      } else {
          const vulnerableCount = result.allFindings?.filter(f => f.isVulnerable).length ?? 0;
          const summaryItems = [ result.urlAnalysis?.executiveSummary, result.serverAnalysis?.executiveSummary, result.databaseAnalysis?.executiveSummary, result.sastAnalysis?.executiveSummary, result.dastAnalysis?.executiveSummary, result.cloudAnalysis?.executiveSummary, result.containerAnalysis?.executiveSummary, result.dependencyAnalysis?.executiveSummary, result.networkAnalysis?.executiveSummary ];
          const primarySummary = result.reportText ? "Informe completo generado." : (summaryItems.find(s => s) || (vulnerableCount > 0 ? 'Se encontraron vulnerabilidades.' : 'No se detectaron vulnerabilidades críticas.'));

          if (result.allFindings && result.allFindings.length > 0) {
             await generateJsonExportFile(result.allFindings, currentTargetDesc);
          }
          if (isPremium && (result.reportText || (result.allFindings && result.allFindings.length > 0))) { // isPremium from useAuth()
            await generateZipFile(result, currentTargetDesc);
          }
          toast({
            title: "Análisis Completo",
            description: `${vulnerableCount} vulnerabilidad(es) activa(s) encontrada(s). ${primarySummary} ${result.error ? ` (Nota: ${result.error})` : ''} ${isPremium ? 'Informe, vectores de ataque, playbooks y descargas disponibles.' : 'Inicie sesión y suscríbase para acceder a todas las funciones premium.'}`,
            variant: vulnerableCount > 0 ? "default" : "default",
            duration: 7000,
          });
      }
    } catch (e) {
      const error = e as Error;
      let errorMessage = "Ocurrió un error inesperado durante el análisis.";
      const apiKeyEnv = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;
      const apiKeyName = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ? "NEXT_PUBLIC_GOOGLE_API_KEY" : "GOOGLE_API_KEY";

      if (!apiKeyEnv || apiKeyEnv === "tu_clave_api_aqui" || apiKeyEnv.trim() === "" || apiKeyEnv === "YOUR_GOOGLE_AI_API_KEY_HERE") {
        errorMessage = `Error de Configuración: La clave API (${apiKeyName}) para el servicio de IA no está configurada. Por favor, revise el archivo .env.local y las instrucciones del README.md.`;
      } else if (error.message && (error.message.includes("API key not valid") || error.message.includes("API key is invalid") || error.message.includes("API_KEY_INVALID"))) {
        errorMessage = `Error de Configuración: La clave API (${apiKeyName}) proporcionada no es válida. Verifique la clave en Google AI Studio y su configuración en .env.local.`;
      } else if (error.message && (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED'))) {
        errorMessage = "Ocurrió un error de red al intentar contactar un servicio de análisis. Por favor, verifica tu conexión a internet e inténtalo de nuevo.";
      } else if (error.message && error.message.includes('quota')) {
        errorMessage = "Se ha excedido una cuota del servicio de análisis (posiblemente de Google AI). Por favor, inténtalo de nuevo más tarde o revisa los límites de tu cuenta.";
      } else if (error.message && (error.message.toLowerCase().includes('json') || error.message.includes('Unexpected token') || error.message.includes('output.findings') || error.message.includes('output!'))) {
          errorMessage = `La IA devolvió un formato inválido o inesperado. Detalles: ${error.message}. Esto puede deberse a un problema temporal con el modelo de IA, filtros de contenido, o un prompt mal formado. Inténtalo de nuevo o simplifica la entrada.`;
      } else {
        errorMessage = `El análisis falló catastróficamente: ${error.message}`;
      }

      setAnalysisResult({ urlAnalysis: null, serverAnalysis: null, databaseAnalysis: null, sastAnalysis: null, dastAnalysis: null, cloudAnalysis: null, containerAnalysis: null, dependencyAnalysis: null, networkAnalysis: null, reportText: null, attackVectors: null, remediationPlaybooks: null, error: errorMessage, allFindings: [] });
      toast({ variant: "destructive", title: "Error Crítico de Análisis", description: errorMessage, duration: 8000 });
    } finally {
      setIsLoadingAnalysis(false);
    }
  };

  const handlePayPalPaymentSuccess = async (details: any) => {
    toast({ title: "¡Pago Procesado!", description: `Orden ${details.orderID} capturada en el backend. Se está actualizando su perfil...`, variant: "default", duration: 5000 });
    await refreshUserProfile();
  };

  const handlePayPalPaymentError = (error: any) => {
    toast({ variant: "destructive", title: "Error de Pago", description: "Hubo un problema al procesar su pago con PayPal." });
  };
  const handlePayPalPaymentCancel = () => {
      toast({ title: "Pago Cancelado", description: "Ha cancelado el proceso de pago.", variant: "default" });
  };
   const handleLoginForPayPal = () => {
    router.push('/login?redirect=/');
  };

  const FeatureCard = ({ title, description, icon: Icon }: { title: string, description: string, icon: React.ElementType }) => (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center text-lg">
          <Icon className="h-6 w-6 mr-3 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );

  const PremiumFeatureCard = ({ title, description, icon: Icon }: { title: string, description:string, icon: React.ElementType }) => (
    <Card className="mt-6 shadow-lg border-l-4 border-accent bg-accent/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-accent"> <Icon className="h-5 w-5" /> {title} </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">{description}</p>
        {!session ? (
            <Button onClick={() => router.push('/login?redirect=/')} className="w-full sm:w-auto bg-accent hover:bg-accent/80 text-accent-foreground">
                <LogIn className="mr-2 h-4 w-4"/>Iniciar Sesión para Acceder
            </Button>
        ) : !isPremium ? (
             <PayPalSmartPaymentButtons
                onPaymentSuccess={handlePayPalPaymentSuccess}
                onPaymentError={handlePayPalPaymentError}
                onPaymentCancel={handlePayPalPaymentCancel}
                onLoginRequired={handleLoginForPayPal}
            />
        ) : (
            <p className="text-sm text-green-600 font-semibold flex items-center"><ShieldCheck className="mr-2 h-4 w-4"/>¡Función Premium Activada!</p>
        )}
      </CardContent>
    </Card>
  );


  if (isLoadingAuth) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-secondary/50">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Cargando sesión...</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen flex flex-col bg-background">
        <AppHeader />
        <main className="flex-grow container mx-auto px-4 py-8 md:py-12">

          {/* Hero Section */}
          <section className="text-center py-12 md:py-20 bg-gradient-to-b from-background to-secondary/30 rounded-xl shadow-inner border border-border">
            <ShieldCheck className="h-16 w-16 text-primary mx-auto mb-6" />
            <h2 className="text-4xl md:text-5xl font-bold mb-4 text-foreground">
              Centro de Análisis de Seguridad Integral
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
              Identifique y mitigue proactivamente vulnerabilidades en sus activos digitales con el poder de la Inteligencia Artificial. Proteja su negocio, datos y reputación.
            </p>
            <Button 
              size="lg" 
              className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg px-8 py-3 text-lg" 
              onClick={() => document.getElementById('analysis-form-section')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <Search className="mr-2 h-5 w-5" /> Iniciar Análisis Ahora
            </Button>
          </section>

          {/* Services Section */}
          <section id="servicios" className="py-12 md:py-16">
            <h3 className="text-3xl font-semibold text-foreground mb-10 text-center">Nuestros Servicios de Análisis Impulsados por IA</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[
                { title: "Análisis Web (URL)", Icon: Globe, desc: "Detecta XSS, SQLi y más en URLs públicas." },
                { title: "Servidores (General)", Icon: ServerIcon, desc: "Evalúa configuraciones de SO y servicios." },
                { title: "Servidores de Juegos", Icon: Gamepad2, desc: "Seguridad específica para Lineage 2, Roblox, etc." },
                { title: "Bases de Datos", Icon: Database, desc: "Identifica debilidades en configuración y acceso a BD." },
                { title: "Código (SAST)", Icon: SearchCode, desc: "Revisa fragmentos de código en busca de fallos." },
                { title: "Dinámico (DAST)", Icon: Network, desc: "Pruebas en aplicaciones web en ejecución (simulado)." },
                { title: "Cloud (AWS, Azure, GCP)", Icon: Cloud, desc: "Revisa configuraciones de seguridad en la nube." },
                { title: "Contenedores", Icon: BoxIcon, desc: "Evalúa Dockerfiles e imágenes de contenedores." },
                { title: "Dependencias", Icon: LibraryIcon, desc: "Busca vulnerabilidades en bibliotecas de terceros." },
                { title: "Red (Conceptual)", Icon: Wifi, desc: "Interpreta descripciones de red y escaneos." },
              ].map(service => (
                <FeatureCard key={service.title} title={service.title} description={service.desc} icon={service.Icon} />
              ))}
            </div>
          </section>
          
          {/* Why Choose Us Section */}
          <section className="py-12 md:py-16 bg-secondary/30 rounded-xl shadow-inner border border-border">
            <div className="container mx-auto px-4">
              <h3 className="text-3xl font-semibold text-foreground mb-10 text-center">¿Por Qué Elegirnos?</h3>
              <div className="grid md:grid-cols-3 gap-8 text-center">
                <div className="flex flex-col items-center p-6 bg-card rounded-lg shadow-md border border-border">
                  <Lightbulb className="h-12 w-12 text-accent mb-4" />
                  <h4 className="text-xl font-semibold mb-2 text-foreground">Análisis Inteligente</h4>
                  <p className="text-muted-foreground text-sm">Utilizamos IA avanzada para detectar vulnerabilidades que otros pasan por alto, ofreciendo una comprensión más profunda de sus riesgos.</p>
                </div>
                <div className="flex flex-col items-center p-6 bg-card rounded-lg shadow-md border border-border">
                  <Target className="h-12 w-12 text-accent mb-4" />
                  <h4 className="text-xl font-semibold mb-2 text-foreground">Cobertura Integral</h4>
                  <p className="text-muted-foreground text-sm">Desde su sitio web hasta su infraestructura en la nube y servidores de juegos, ofrecemos una visión 360° de su postura de seguridad.</p>
                </div>
                <div className="flex flex-col items-center p-6 bg-card rounded-lg shadow-md border border-border">
                  <ShieldCheck className="h-12 w-12 text-accent mb-4" />
                  <h4 className="text-xl font-semibold mb-2 text-foreground">Resultados Accionables</h4>
                  <p className="text-muted-foreground text-sm">No solo identificamos problemas, sino que proporcionamos informes detallados y (con premium) playbooks para ayudarle a remediarlos.</p>
                </div>
              </div>
            </div>
          </section>

          <section id="analysis-form-section" className="py-12 md:py-16">
            <Card className="max-w-4xl mx-auto bg-card p-6 md:p-10 rounded-xl shadow-2xl border border-primary/20">
              <CardHeader className="text-center p-0 pb-6">
                <CardTitle className="text-2xl md:text-3xl font-semibold text-foreground">Realice su Análisis de Seguridad Ahora</CardTitle>
                <CardDescription className="text-muted-foreground md:text-lg">Seleccione los activos que desea analizar.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <UrlInputForm onSubmit={handleFormSubmit} isLoading={isLoadingAnalysis} defaultUrl={exampleUrl} />
              </CardContent>
            </Card>
          </section>

          <Separator className="my-8 md:my-12" />

          {/* Testimonials Placeholder Section */}
          <section className="py-12 md:py-16">
            <h3 className="text-3xl font-semibold text-foreground mb-10 text-center">La Confianza de Nuestros Clientes</h3>
            <div className="grid md:grid-cols-2 gap-8">
              <Card className="bg-card border-border shadow-sm">
                <CardContent className="pt-6">
                  <MessageSquareText className="h-8 w-8 text-primary mb-3" />
                  <p className="text-muted-foreground mb-4 italic">\"Desde que usamos el Centro de Análisis de Seguridad Integral, hemos mejorado drásticamente nuestra postura de seguridad y reducido los tiempos de respuesta a incidentes. ¡Imprescindible!\"</p>
                  <p className="font-semibold text-foreground">- CEO, Tech Solutions Inc.</p>
                </CardContent>
              </Card>
              <Card className="bg-card border-border shadow-sm">
                <CardContent className="pt-6">
                  <MessageSquareText className="h-8 w-8 text-primary mb-3" />
                  <p className="text-muted-foreground mb-4 italic">\"La capacidad de analizar nuestros servidores de juegos y la configuración de la nube en una sola plataforma nos ha ahorrado innumerables horas y nos ha dado una tranquilidad invaluable.\"</p>
                  <p className="font-semibold text-foreground">- Admin de Sistemas, Gaming Universe Ltd.</p>
                </CardContent>
              </Card>
            </div>
          </section>
          
          <Separator className="my-8 md:my-12" />

          {isLoadingAnalysis && (
            <div className="space-y-8 mt-8">
              <Card className="shadow-lg animate-pulse bg-card"> <CardHeader> <Skeleton className="h-8 w-1/2 bg-muted" /> </CardHeader> <CardContent className="space-y-4"> <Skeleton className="h-6 w-3/4 mb-4 bg-muted" /> <div className="grid grid-cols-2 md:grid-cols-4 gap-4"> <Skeleton className="h-16 w-full bg-muted" /> <Skeleton className="h-16 w-full bg-muted" /> <Skeleton className="h-16 w-full bg-muted" /> <Skeleton className="h-16 w-full bg-muted" /> </div> <Skeleton className="h-40 w-full mt-4 bg-muted" /> </CardContent> </Card>
            </div>
          )}

          {!isLoadingAnalysis && analysisResult && (
            <div className="space-y-8">
              <AnalysisSummaryCard result={analysisResult} />
              <VulnerabilityReportDisplay result={analysisResult} isPremiumUser={isPremium} />

              {isPremium && analysisResult.attackVectors && analysisResult.attackVectors.length > 0 && (
                 <> <Separator className="my-8 md:my-12" /> <AttackVectorsDisplay attackVectors={analysisResult.attackVectors as AttackVector[]} /> </> 
              )}
              {!isPremium && analysisResult.allFindings && analysisResult.allFindings.some(f => f.isVulnerable) && ( 
                <PremiumFeatureCard title="Escenarios de Ataque Ilustrativos (Premium)" description="Comprenda cómo las vulnerabilidades activas identificadas podrían ser explotadas con ejemplos conceptuales." icon={Zap} />
              )}

              {isPremium && analysisResult.remediationPlaybooks && analysisResult.remediationPlaybooks.length > 0 && ( 
                <> <Separator className="my-8 md:my-12" /> <RemediationPlaybooksDisplay playbooks={analysisResult.remediationPlaybooks} /> </> 
              )}
               {!isPremium && analysisResult.allFindings && analysisResult.allFindings.some(f => f.isVulnerable) && (
                <PremiumFeatureCard title="Playbooks de Remediación Sugeridos (Premium)" description="Acceda a guías paso a paso generadas por IA para ayudar a corregir las vulnerabilidades detectadas." icon={FileLock2} />
               )}

              {(analysisResult.reportText || (analysisResult.allFindings && analysisResult.allFindings.length > 0)) && (
                <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mt-8">
                    {isPremium && zipUrl ? ( <Button asChild size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground w-full sm:w-auto"> <a href={zipUrl} download={`analisis_seguridad_${submittedTargetDescription.replace(/[^a-zA-Z0-9.-]/g, '_').substring(0,50)}_${new Date().toISOString().split('T')[0]}.zip`}> <Download className="mr-2 h-5 w-5" /> Descargar Paquete (ZIP) </a> </Button>
                    ) : !isPremium && session && (analysisResult.allFindings && analysisResult.allFindings.length > 0) && (
                         <Tooltip> <TooltipTrigger asChild> <Button size="lg" className="bg-primary text-primary-foreground w-full sm:w-auto opacity-70 cursor-not-allowed" onClick={() => router.push('/login?redirect=/')}> <LockIcon className="mr-2 h-5 w-5" /> Descargar Paquete (ZIP)</Button> </TooltipTrigger> <TooltipContent> <p>Inicie sesión y suscríbase para descargar el paquete completo.</p> </TooltipContent> </Tooltip>
                    )}
                     {jsonExportUrl && ( <Button asChild size="lg" variant="outline" className="w-full sm:w-auto"> <a href={jsonExportUrl} download={`hallazgos_seguridad_${submittedTargetDescription.replace(/[^a-zA-Z0-9.-]/g, '_').substring(0,50)}_${new Date().toISOString().split('T')[0]}.json`}> <FileJson className="mr-2 h-5 w-5" /> Descargar Hallazgos (JSON) </a> </Button> )}
                </div>
                 )}
                 {isPremium && zipUrl && ( <p className="text-xs text-muted-foreground mt-2 text-center"> El ZIP contiene informe, hallazgos, y (si generados) vectores de ataque y playbooks. El JSON contiene todos los hallazgos. </p> )}
                 {!isPremium && session && jsonExportUrl && ( <p className="text-xs text-muted-foreground mt-2 text-center"> El JSON contiene todos los hallazgos. Suscríbase para la descarga ZIP completa. </p> )}
                 {!session && jsonExportUrl && ( <p className="text-xs text-muted-foreground mt-2 text-center"> El JSON contiene todos los hallazgos. Inicie sesión y suscríbase para la descarga ZIP completa. </p> )}
            </div>
          )}

          {!isLoadingAnalysis && !analysisResult && (
             <Card className="mt-8 shadow-lg max-w-3xl mx-auto border-l-4 border-primary bg-card">
              <CardHeader> <CardTitle className="flex items-center gap-3 text-xl"> <ShieldCheck className="h-7 w-7 text-primary" /> Plataforma Integral de Análisis de Seguridad </CardTitle> <CardDescription className="text-muted-foreground"> Ingrese los detalles en el formulario superior para iniciar un análisis de seguridad asistido por IA. </CardDescription> </CardHeader>
              <CardContent className="space-y-4">
                  <p className="text-muted-foreground"> Nuestra plataforma analiza URLs, servidores (incluyendo juegos como Lineage 2, Roblox), bases de datos, código (SAST), aplicaciones (DAST simulado), configuraciones Cloud, contenedores, dependencias y redes. </p>
                  <div className="mt-6 pt-6 border-t border-border flex flex-col items-center gap-4">
                      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2"><ShoppingCart className="h-6 w-6 text-accent" /> Suscríbase para Acceso Premium</h3>
                       <p className="text-sm text-center text-muted-foreground max-w-md"> Desbloquee informes técnicos detallados, escenarios de ataque, playbooks de remediación y descargas ZIP completas. </p>
                      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
                          {!session ? (
                              <Button onClick={() => router.push('/login?redirect=/')} className="w-full" size="lg"> <LogIn className="mr-2 h-5 w-5" /> Iniciar Sesión para Suscribirse </Button>
                          ) : !isPremium ? (
                              <PayPalSmartPaymentButtons
                                  onPaymentSuccess={handlePayPalPaymentSuccess}
                                  onPaymentError={handlePayPalPaymentError}
                                  onPaymentCancel={handlePayPalPaymentCancel}
                                  onLoginRequired={handleLoginForPayPal}
                              />
                          ) : (
                               <p className="text-center text-green-600 font-semibold mt-3 flex items-center gap-2"><ShieldCheck className="h-5 w-5"/> ¡Suscripción Premium Activa!</p>
                          )}
                      </div>
                       <p className="text-xs text-muted-foreground mt-3 text-center">
                         Flujo de pago simulado con PayPal Sandbox. La activación real de Premium requiere completar la lógica de captura y actualización de base de datos en el backend.
                       </p>
                  </div>
              </CardContent>
             </Card>
          )}
        </main>

        <Dialog open={isChatOpen} onOpenChange={setIsChatOpen}>
         <DialogTrigger asChild>
              <Button variant="outline" size="icon" className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-2xl bg-primary hover:bg-primary/90 text-primary-foreground border-2 border-primary-foreground/50" aria-label="Abrir Asistente IA" > <Bot className="h-7 w-7" /> </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[450px] p-0 border-0 shadow-none bg-transparent">
            <DialogHeader>
             <DialogTitle className="sr-only">Asistente de Chat IA</DialogTitle>
            </DialogHeader>
            <ChatAssistant />
          </DialogContent>
        </Dialog>

        <footer className="text-center py-8 text-sm text-muted-foreground border-t border-border bg-card">
          <p>© {new Date().getFullYear()} Centro de Análisis de Seguridad Integral. Todos los derechos reservados.</p>
          <p className="mb-2">Idea y Visión: Ronald Gonzalez Niche</p>
          <div className="space-x-3">
            <Link href="/terms" className="text-xs text-primary hover:underline"> Términos y Condiciones </Link>
            <span className="text-xs text-muted-foreground">|</span>
            <Link href="/privacy" className="text-xs text-primary hover:underline"> Política de Privacidad </Link>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}

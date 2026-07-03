import "dotenv/config";
import * as bcrypt from "bcrypt";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  AppointmentStatus,
  FinancialTransactionCategory,
  FinancialTransactionStatus,
  FinancialTransactionType,
  PaymentMethod,
  Prisma,
  PrismaClient,
  UserRole,
} from "@prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined.");
}

const adapter = new PrismaPg(connectionString);
const prisma = new PrismaClient({ adapter });

const DEFAULT_PASSWORD = "ChangeMe123!";
const DEMO_TAG = "[demo-seed]";

const ADMIN_USER_ID = "1b5d4d7c-b7e6-4d8b-9b3d-a3b12f1e1001";
const PSYCHOLOGIST_USER_ID = "1b5d4d7c-b7e6-4d8b-9b3d-a3b12f1e1002";

const now = new Date();

type AppointmentTemplate = {
  daysFromNow: number;
  hour: number;
  minute: number;
  durationMinutes: number;
  status: AppointmentStatus;
  notes: string;
  fee?: number;
  paymentMethod?: PaymentMethod;
  createPendingCharge?: boolean;
};

type SessionNoteTemplate = {
  daysAgo: number;
  hour: number;
  minute: number;
  title: string;
  content: string;
};

type DocumentTemplate = {
  daysAgo: number;
  fileName: string;
  mimeType: string;
};

type PatientBlueprint = {
  code: number;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  birthDate: Date;
  diagnosis?: string;
  treatmentPlan?: string;
  appointments: AppointmentTemplate[];
  sessionNotes?: SessionNoteTemplate[];
  documents?: DocumentTemplate[];
};

type DemoFinancialTransaction = Prisma.FinancialTransactionCreateManyInput;

function addDays(baseDate: Date, days: number) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + days);
  return date;
}

function addMinutes(baseDate: Date, minutes: number) {
  const date = new Date(baseDate);
  date.setMinutes(date.getMinutes() + minutes);
  return date;
}

function setTime(date: Date, hour: number, minute: number) {
  const nextDate = new Date(date);
  nextDate.setHours(hour, minute, 0, 0);
  return nextDate;
}

function dateFromNow(days: number, hour: number, minute: number) {
  return setTime(addDays(now, days), hour, minute);
}

function birthDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

function demoUuid(namespace: number, value: number) {
  return `${namespace.toString().padStart(8, "0")}-0000-4000-8000-${value
    .toString()
    .padStart(12, "0")}`;
}

const patientBlueprints: PatientBlueprint[] = [
  {
    code: 1,
    firstName: "Sofia",
    lastName: "Ramirez",
    phoneNumber: "+526621110001",
    email: "sofia.ramirez@psychology-app.local",
    birthDate: birthDate(1998, 4, 12),
    diagnosis:
      "Consulta por estres academico, dificultad para sostener descanso y tendencia a sobrecarga en semanas de evaluaciones.",
    treatmentPlan:
      "Psicoeducacion sobre estres, rutina de descanso, registro semanal y tecnicas breves de regulacion.",
    appointments: [
      {
        daysFromNow: -42,
        hour: 10,
        minute: 0,
        durationMinutes: 60,
        status: AppointmentStatus.COMPLETED,
        notes: "Entrevista inicial y encuadre.",
        fee: 700,
        paymentMethod: PaymentMethod.TRANSFER,
      },
      {
        daysFromNow: -14,
        hour: 10,
        minute: 0,
        durationMinutes: 50,
        status: AppointmentStatus.COMPLETED,
        notes: "Seguimiento de rutina de descanso.",
        fee: 700,
        paymentMethod: PaymentMethod.CARD,
      },
      {
        daysFromNow: 5,
        hour: 11,
        minute: 0,
        durationMinutes: 50,
        status: AppointmentStatus.SCHEDULED,
        notes: "Revision de habitos y carga academica.",
        fee: 700,
        createPendingCharge: true,
      },
    ],
    sessionNotes: [
      {
        daysAgo: 42,
        hour: 10,
        minute: 0,
        title: "Evaluacion inicial",
        content:
          "Se explora motivo de consulta, presiones academicas y habitos de descanso. Se acuerda registro breve de sueno.",
      },
      {
        daysAgo: 14,
        hour: 10,
        minute: 0,
        title: "Seguimiento de habitos",
        content:
          "Refiere mayor orden semanal. Se refuerzan pausas breves y respiracion diafragmatica antes de estudiar.",
      },
    ],
    documents: [
      {
        daysAgo: 40,
        fileName: "consentimiento-informado-sofia.pdf",
        mimeType: "application/pdf",
      },
    ],
  },
  {
    code: 2,
    firstName: "Carlos",
    lastName: "Navarro",
    phoneNumber: "+526621110002",
    email: "carlos.navarro@psychology-app.local",
    birthDate: birthDate(1989, 9, 23),
    diagnosis:
      "Dificultades de comunicacion laboral y tension sostenida ante conversaciones dificiles.",
    treatmentPlan:
      "Entrenamiento en comunicacion asertiva, identificacion de pensamientos automaticos y planeacion conductual.",
    appointments: [
      {
        daysFromNow: -49,
        hour: 9,
        minute: 30,
        durationMinutes: 60,
        status: AppointmentStatus.COMPLETED,
        notes: "Historia del problema y objetivos iniciales.",
        fee: 800,
        paymentMethod: PaymentMethod.TRANSFER,
      },
      {
        daysFromNow: -18,
        hour: 9,
        minute: 30,
        durationMinutes: 45,
        status: AppointmentStatus.NO_SHOW,
        notes: "No se presento a la cita programada.",
      },
      {
        daysFromNow: 12,
        hour: 12,
        minute: 0,
        durationMinutes: 60,
        status: AppointmentStatus.SCHEDULED,
        notes: "Seguimiento de comunicacion asertiva.",
        fee: 800,
        createPendingCharge: true,
      },
    ],
    sessionNotes: [
      {
        daysAgo: 49,
        hour: 9,
        minute: 30,
        title: "Historia del problema",
        content:
          "Se revisan situaciones laborales recientes y respuestas de tension. Se propone observar detonantes.",
      },
      {
        daysAgo: 28,
        hour: 9,
        minute: 30,
        title: "Comunicacion asertiva",
        content:
          "Se practica estructura de mensajes en primera persona y preparacion previa de conversaciones.",
      },
      {
        daysAgo: 7,
        hour: 9,
        minute: 30,
        title: "Revision de acuerdos",
        content:
          "Se refuerzan avances y se ajusta tarea de registrar conversaciones breves.",
      },
    ],
    documents: [
      {
        daysAgo: 46,
        fileName: "plan-objetivos-carlos.pdf",
        mimeType: "application/pdf",
      },
    ],
  },
  {
    code: 3,
    firstName: "Mariana",
    lastName: "Lopez",
    phoneNumber: "+526621110003",
    email: "mariana.lopez@psychology-app.local",
    birthDate: birthDate(1995, 1, 30),
    diagnosis:
      "Ajuste a cambios de rutina y fortalecimiento de limites personales.",
    treatmentPlan:
      "Trabajo en limites saludables, actividades gratificantes y seguimiento quincenal de avances.",
    appointments: [
      {
        daysFromNow: -24,
        hour: 16,
        minute: 0,
        durationMinutes: 50,
        status: AppointmentStatus.COMPLETED,
        notes: "Definicion de objetivos terapeuticos.",
        fee: 750,
        paymentMethod: PaymentMethod.CASH,
      },
      {
        daysFromNow: 0,
        hour: 16,
        minute: 30,
        durationMinutes: 50,
        status: AppointmentStatus.SCHEDULED,
        notes: "Sesion programada para hoy por la tarde.",
        fee: 750,
        createPendingCharge: true,
      },
    ],
    sessionNotes: [
      {
        daysAgo: 24,
        hour: 16,
        minute: 0,
        title: "Objetivos terapeuticos",
        content:
          "Se delimitan objetivos iniciales y se acuerda observacion de necesidades y limites.",
      },
    ],
  },
  {
    code: 4,
    firstName: "Diego",
    lastName: "Torres",
    phoneNumber: "+526621110004",
    email: "diego.torres@psychology-app.local",
    birthDate: birthDate(1992, 6, 5),
    diagnosis:
      "Adaptacion a nuevo empleo con preocupacion recurrente por desempeno.",
    treatmentPlan:
      "Psicoeducacion, solucion de problemas y registro de logros diarios.",
    appointments: [
      {
        daysFromNow: -36,
        hour: 13,
        minute: 0,
        durationMinutes: 60,
        status: AppointmentStatus.COMPLETED,
        notes: "Evaluacion de adaptacion laboral.",
        fee: 800,
        paymentMethod: PaymentMethod.TRANSFER,
      },
      {
        daysFromNow: -3,
        hour: 13,
        minute: 0,
        durationMinutes: 60,
        status: AppointmentStatus.COMPLETED,
        notes: "Revision de pensamientos automaticos.",
        fee: 800,
        paymentMethod: PaymentMethod.CARD,
      },
      {
        daysFromNow: 21,
        hour: 13,
        minute: 30,
        durationMinutes: 60,
        status: AppointmentStatus.SCHEDULED,
        notes: "Seguimiento de metas laborales.",
        fee: 800,
        createPendingCharge: true,
      },
    ],
    sessionNotes: [
      {
        daysAgo: 36,
        hour: 13,
        minute: 0,
        title: "Adaptacion laboral",
        content:
          "Se identifican fuentes de presion y recursos ya disponibles. Se registra evidencia de desempeno suficiente.",
      },
      {
        daysAgo: 3,
        hour: 13,
        minute: 0,
        title: "Flexibilidad cognitiva",
        content:
          "Se revisan pensamientos de exigencia elevada y se construyen alternativas mas realistas.",
      },
    ],
    documents: [
      {
        daysAgo: 2,
        fileName: "registro-logros-diego.png",
        mimeType: "image/png",
      },
    ],
  },
  {
    code: 5,
    firstName: "Valeria",
    lastName: "Mendoza",
    phoneNumber: "+526621110005",
    email: "valeria.mendoza@psychology-app.local",
    birthDate: birthDate(2001, 11, 18),
    diagnosis: "Organizacion personal y preocupacion por rendimiento escolar.",
    treatmentPlan:
      "Agenda semanal, division de tareas largas y autoinstrucciones funcionales.",
    appointments: [
      {
        daysFromNow: -56,
        hour: 17,
        minute: 0,
        durationMinutes: 50,
        status: AppointmentStatus.COMPLETED,
        notes: "Revision de rutina academica.",
        fee: 650,
        paymentMethod: PaymentMethod.CASH,
      },
      {
        daysFromNow: -9,
        hour: 17,
        minute: 0,
        durationMinutes: 50,
        status: AppointmentStatus.CANCELLED,
        notes: "Cancelada por cambio de horario del paciente.",
      },
      {
        daysFromNow: 28,
        hour: 17,
        minute: 30,
        durationMinutes: 50,
        status: AppointmentStatus.SCHEDULED,
        notes: "Seguimiento mensual de organizacion.",
        fee: 650,
        createPendingCharge: true,
      },
    ],
    sessionNotes: [
      {
        daysAgo: 56,
        hour: 17,
        minute: 0,
        title: "Planeacion academica",
        content:
          "Se revisa calendario escolar y se priorizan tareas con bloques cortos de trabajo.",
      },
      {
        daysAgo: 42,
        hour: 17,
        minute: 0,
        title: "Autoinstrucciones",
        content:
          "Se practican frases funcionales para iniciar tareas y reducir postergacion.",
      },
      {
        daysAgo: 15,
        hour: 17,
        minute: 0,
        title: "Ajuste de plan",
        content:
          "Se ajusta agenda semanal incorporando descansos y metas realistas.",
      },
    ],
  },
  {
    code: 6,
    firstName: "Luis",
    lastName: "Herrera",
    phoneNumber: "+526621110006",
    email: "luis.herrera@psychology-app.local",
    birthDate: birthDate(1984, 2, 2),
    diagnosis:
      "Desequilibrio entre trabajo y vida personal, con baja recuperacion semanal.",
    treatmentPlan:
      "Definir limites de disponibilidad, agenda de recuperacion y comunicacion familiar.",
    appointments: [
      {
        daysFromNow: -30,
        hour: 8,
        minute: 30,
        durationMinutes: 45,
        status: AppointmentStatus.COMPLETED,
        notes: "Exploracion de balance trabajo-vida.",
        fee: 850,
        paymentMethod: PaymentMethod.TRANSFER,
      },
      {
        daysFromNow: 7,
        hour: 8,
        minute: 30,
        durationMinutes: 45,
        status: AppointmentStatus.SCHEDULED,
        notes: "Seguimiento de limites de disponibilidad.",
        fee: 850,
      },
    ],
    sessionNotes: [
      {
        daysAgo: 30,
        hour: 8,
        minute: 30,
        title: "Balance personal",
        content:
          "Se revisan horarios y responsabilidades. Se identifican dos espacios semanales de recuperacion personal.",
      },
      {
        daysAgo: 3,
        hour: 8,
        minute: 30,
        title: "Limites de disponibilidad",
        content:
          "Reporta mejora al cerrar jornada en horario definido. Se practica comunicacion clara de limites.",
      },
    ],
  },
  {
    code: 7,
    firstName: "Ana Paula",
    lastName: "Castro",
    phoneNumber: "+526621110007",
    email: "ana.castro@psychology-app.local",
    birthDate: birthDate(1990, 7, 14),
    diagnosis:
      "Ajuste a cambios familiares recientes y fortalecimiento de red de apoyo.",
    treatmentPlan:
      "Explorar recursos de apoyo, autocuidado y acuerdos concretos de seguimiento.",
    appointments: [
      {
        daysFromNow: -15,
        hour: 18,
        minute: 0,
        durationMinutes: 60,
        status: AppointmentStatus.COMPLETED,
        notes: "Exploracion de red de apoyo.",
        fee: 780,
        paymentMethod: PaymentMethod.CARD,
      },
      {
        daysFromNow: 18,
        hour: 18,
        minute: 0,
        durationMinutes: 60,
        status: AppointmentStatus.SCHEDULED,
        notes: "Seguimiento de autocuidado y apoyo familiar.",
        fee: 780,
      },
    ],
    sessionNotes: [
      {
        daysAgo: 15,
        hour: 18,
        minute: 0,
        title: "Red de apoyo",
        content:
          "Se identifica red cercana y formas practicas de pedir apoyo. Se acuerda una actividad de autocuidado.",
      },
    ],
  },
  {
    code: 8,
    firstName: "Ricardo",
    lastName: "Salazar",
    phoneNumber: "+526621110008",
    email: "ricardo.salazar@psychology-app.local",
    birthDate: birthDate(1978, 12, 9),
    diagnosis: "Manejo de preocupaciones cotidianas y mejora de descanso.",
    treatmentPlan:
      "Higiene del sueno, registro de preocupaciones y tecnicas de relajacion.",
    appointments: [
      {
        daysFromNow: -60,
        hour: 12,
        minute: 30,
        durationMinutes: 90,
        status: AppointmentStatus.COMPLETED,
        notes: "Evaluacion extensa de rutina y descanso.",
        fee: 950,
        paymentMethod: PaymentMethod.TRANSFER,
      },
      {
        daysFromNow: -22,
        hour: 12,
        minute: 30,
        durationMinutes: 60,
        status: AppointmentStatus.COMPLETED,
        notes: "Revision de registro de preocupaciones.",
        fee: 850,
        paymentMethod: PaymentMethod.TRANSFER,
      },
      {
        daysFromNow: 30,
        hour: 12,
        minute: 30,
        durationMinutes: 60,
        status: AppointmentStatus.SCHEDULED,
        notes: "Seguimiento a 30 dias.",
        fee: 850,
        createPendingCharge: true,
      },
    ],
    sessionNotes: [
      {
        daysAgo: 60,
        hour: 12,
        minute: 30,
        title: "Rutina de descanso",
        content:
          "Se revisan horarios de sueno y habitos nocturnos. Se acuerda reducir pantallas antes de dormir.",
      },
      {
        daysAgo: 45,
        hour: 12,
        minute: 30,
        title: "Registro de preocupaciones",
        content:
          "Se implementa tecnica de posponer preocupaciones y registrar temas recurrentes.",
      },
      {
        daysAgo: 7,
        hour: 12,
        minute: 30,
        title: "Seguimiento",
        content:
          "Refiere descanso mas estable y continuidad del plan con ajustes menores.",
      },
    ],
    documents: [
      {
        daysAgo: 21,
        fileName: "higiene-sueno-ricardo.jpg",
        mimeType: "image/jpeg",
      },
    ],
  },
  {
    code: 9,
    firstName: "Fernanda",
    lastName: "Rios",
    phoneNumber: "+526621110009",
    email: "fernanda.rios@psychology-app.local",
    birthDate: birthDate(1997, 5, 27),
    diagnosis:
      "Toma de decisiones personales con necesidad de mayor claridad de metas.",
    treatmentPlan:
      "Ejercicios de valores, matriz de decisiones y seguimiento de acciones pequenas.",
    appointments: [
      {
        daysFromNow: -45,
        hour: 15,
        minute: 0,
        durationMinutes: 60,
        status: AppointmentStatus.COMPLETED,
        notes: "Exploracion de metas.",
        fee: 760,
        paymentMethod: PaymentMethod.CARD,
      },
      {
        daysFromNow: 10,
        hour: 15,
        minute: 0,
        durationMinutes: 50,
        status: AppointmentStatus.SCHEDULED,
        notes: "Seguimiento de acciones concretas.",
        fee: 760,
      },
    ],
    sessionNotes: [
      {
        daysAgo: 45,
        hour: 15,
        minute: 0,
        title: "Claridad de metas",
        content:
          "Se exploran metas personales de corto plazo y valores asociados. Se priorizan dos acciones concretas.",
      },
      {
        daysAgo: 15,
        hour: 15,
        minute: 0,
        title: "Matriz de decisiones",
        content:
          "Se revisan opciones y costos percibidos. Reporta mayor claridad para decidir gradualmente.",
      },
    ],
  },
  {
    code: 10,
    firstName: "Jorge",
    lastName: "Molina",
    phoneNumber: "+526621110010",
    email: "jorge.molina@psychology-app.local",
    birthDate: birthDate(1982, 3, 21),
    diagnosis: "Comunicacion en pareja y manejo de desacuerdos cotidianos.",
    treatmentPlan:
      "Entrenar escucha activa, pausa ante discusiones y acuerdos semanales.",
    appointments: [
      {
        daysFromNow: -30,
        hour: 19,
        minute: 0,
        durationMinutes: 60,
        status: AppointmentStatus.COMPLETED,
        notes: "Entrenamiento en escucha activa.",
        fee: 820,
        paymentMethod: PaymentMethod.TRANSFER,
      },
      {
        daysFromNow: -1,
        hour: 19,
        minute: 0,
        durationMinutes: 60,
        status: AppointmentStatus.CANCELLED,
        notes: "Cancelada con anticipacion por agenda laboral.",
      },
      {
        daysFromNow: 24,
        hour: 19,
        minute: 0,
        durationMinutes: 60,
        status: AppointmentStatus.SCHEDULED,
        notes: "Seguimiento de acuerdos semanales.",
        fee: 820,
      },
    ],
    sessionNotes: [
      {
        daysAgo: 30,
        hour: 19,
        minute: 0,
        title: "Escucha activa",
        content:
          "Se identifica patron de interrupciones y se practica validacion breve.",
      },
      {
        daysAgo: 7,
        hour: 19,
        minute: 0,
        title: "Acuerdos semanales",
        content:
          "Se definen acuerdos especificos y uso de pausas antes de responder.",
      },
    ],
    documents: [
      {
        daysAgo: 5,
        fileName: "acuerdos-semanales-jorge.pdf",
        mimeType: "application/pdf",
      },
    ],
  },
  {
    code: 11,
    firstName: "Camila",
    lastName: "Ortega",
    phoneNumber: "+526621110011",
    email: "camila.ortega@psychology-app.local",
    birthDate: birthDate(2000, 8, 3),
    appointments: [
      {
        daysFromNow: -15,
        hour: 11,
        minute: 30,
        durationMinutes: 50,
        status: AppointmentStatus.COMPLETED,
        notes: "Definicion de metas sociales graduales.",
        fee: 690,
        paymentMethod: PaymentMethod.CASH,
      },
      {
        daysFromNow: 14,
        hour: 11,
        minute: 30,
        durationMinutes: 50,
        status: AppointmentStatus.SCHEDULED,
        notes: "Seguimiento de exposicion gradual.",
        fee: 690,
      },
    ],
  },
  {
    code: 12,
    firstName: "Andres",
    lastName: "Vega",
    phoneNumber: "+526621110012",
    email: "andres.vega@psychology-app.local",
    birthDate: birthDate(1987, 10, 16),
    diagnosis:
      "Manejo de frustracion ante cambios de planes y ajuste de expectativas.",
    treatmentPlan:
      "Planeacion flexible, registro de avances y reestructuracion de expectativas.",
    appointments: [
      {
        daysFromNow: -60,
        hour: 14,
        minute: 0,
        durationMinutes: 90,
        status: AppointmentStatus.COMPLETED,
        notes: "Evaluacion inicial amplia.",
        fee: 950,
        paymentMethod: PaymentMethod.TRANSFER,
      },
      {
        daysFromNow: -6,
        hour: 14,
        minute: 0,
        durationMinutes: 60,
        status: AppointmentStatus.NO_SHOW,
        notes: "No asistio a seguimiento programado.",
      },
      {
        daysFromNow: 4,
        hour: 14,
        minute: 0,
        durationMinutes: 60,
        status: AppointmentStatus.SCHEDULED,
        notes: "Reprogramacion de seguimiento.",
        fee: 850,
        createPendingCharge: true,
      },
    ],
    sessionNotes: [
      {
        daysAgo: 60,
        hour: 14,
        minute: 0,
        title: "Expectativas y metas",
        content:
          "Se identifican expectativas rigidas y se acuerdan metas ajustables.",
      },
      {
        daysAgo: 45,
        hour: 14,
        minute: 0,
        title: "Planeacion flexible",
        content: "Se practica generar alternativas ante cambios de agenda.",
      },
      {
        daysAgo: 15,
        hour: 14,
        minute: 0,
        title: "Seguimiento de frustracion",
        content:
          "Se analizan respuestas ante imprevistos recientes y pausas antes de decidir cambios.",
      },
    ],
  },
  {
    code: 13,
    firstName: "Natalia",
    lastName: "Paredes",
    phoneNumber: "+526621110013",
    email: "natalia.paredes@psychology-app.local",
    birthDate: birthDate(1993, 4, 6),
    diagnosis:
      "Autocuidado y recuperacion de actividades significativas tras periodos de alta demanda.",
    treatmentPlan:
      "Agenda de autocuidado, revision de energia disponible y limites en compromisos.",
    appointments: [
      {
        daysFromNow: -30,
        hour: 10,
        minute: 30,
        durationMinutes: 50,
        status: AppointmentStatus.COMPLETED,
        notes: "Exploracion de autocuidado.",
        fee: 720,
        paymentMethod: PaymentMethod.CARD,
      },
      {
        daysFromNow: 16,
        hour: 10,
        minute: 30,
        durationMinutes: 50,
        status: AppointmentStatus.SCHEDULED,
        notes: "Seguimiento de actividades significativas.",
        fee: 720,
      },
    ],
    sessionNotes: [
      {
        daysAgo: 30,
        hour: 10,
        minute: 30,
        title: "Actividades significativas",
        content:
          "Se identifican actividades que aportan bienestar y barreras para retomarlas.",
      },
      {
        daysAgo: 7,
        hour: 10,
        minute: 30,
        title: "Energia disponible",
        content:
          "Se revisa carga semanal y se ajustan compromisos. Mejora reconocimiento de limites.",
      },
    ],
  },
  {
    code: 14,
    firstName: "Mateo",
    lastName: "Cardenas",
    phoneNumber: "+526621110014",
    email: "mateo.cardenas@psychology-app.local",
    birthDate: birthDate(1999, 9, 11),
    appointments: [
      {
        daysFromNow: -45,
        hour: 16,
        minute: 30,
        durationMinutes: 60,
        status: AppointmentStatus.COMPLETED,
        notes: "Tecnica pausa-respuesta.",
        fee: 740,
        paymentMethod: PaymentMethod.CASH,
      },
      {
        daysFromNow: 9,
        hour: 16,
        minute: 30,
        durationMinutes: 60,
        status: AppointmentStatus.SCHEDULED,
        notes: "Seguimiento de toma de perspectiva.",
        fee: 740,
      },
    ],
  },
  {
    code: 15,
    firstName: "Elena",
    lastName: "Soto",
    phoneNumber: "+526621110015",
    email: "elena.soto@psychology-app.local",
    birthDate: birthDate(1975, 1, 25),
    diagnosis:
      "Transicion de etapa personal y redefinicion de rutinas de bienestar.",
    treatmentPlan:
      "Explorar prioridades actuales, crear rutina flexible y revisar avances mensuales.",
    appointments: [
      {
        daysFromNow: -60,
        hour: 9,
        minute: 0,
        durationMinutes: 90,
        status: AppointmentStatus.COMPLETED,
        notes: "Evaluacion inicial de transicion vital.",
        fee: 900,
        paymentMethod: PaymentMethod.TRANSFER,
      },
      {
        daysFromNow: 26,
        hour: 9,
        minute: 0,
        durationMinutes: 60,
        status: AppointmentStatus.SCHEDULED,
        notes: "Revision mensual de rutina flexible.",
        fee: 780,
      },
    ],
    sessionNotes: [
      {
        daysAgo: 60,
        hour: 9,
        minute: 0,
        title: "Transicion de etapa",
        content: "Se exploran cambios recientes y prioridades actuales.",
      },
      {
        daysAgo: 30,
        hour: 9,
        minute: 0,
        title: "Rutina flexible",
        content:
          "Se disena rutina semanal con espacios de actividad fisica ligera y contacto social.",
      },
      {
        daysAgo: 7,
        hour: 9,
        minute: 0,
        title: "Revision mensual",
        content:
          "Reporta mayor estructura durante la semana y se ajustan metas para sostener consistencia.",
      },
    ],
  },
  {
    code: 16,
    firstName: "Paula",
    lastName: "Ibarra",
    phoneNumber: "+526621110016",
    email: "paula.ibarra@psychology-app.local",
    birthDate: birthDate(1991, 12, 1),
    diagnosis:
      "Seguimiento de ansiedad situacional asociada a presentaciones de trabajo.",
    treatmentPlan:
      "Exposicion gradual, ensayo de presentaciones y regulacion fisiologica breve.",
    appointments: [
      {
        daysFromNow: -20,
        hour: 18,
        minute: 30,
        durationMinutes: 50,
        status: AppointmentStatus.COMPLETED,
        notes: "Revision de detonantes en presentaciones.",
        fee: 790,
        paymentMethod: PaymentMethod.CARD,
      },
      {
        daysFromNow: 2,
        hour: 18,
        minute: 30,
        durationMinutes: 50,
        status: AppointmentStatus.SCHEDULED,
        notes: "Ensayo de presentacion proxima.",
        fee: 790,
        createPendingCharge: true,
      },
    ],
    sessionNotes: [
      {
        daysAgo: 20,
        hour: 18,
        minute: 30,
        title: "Ansiedad situacional",
        content:
          "Se identifican detonantes previos a exposiciones y se practica respiracion breve.",
      },
    ],
    documents: [
      {
        daysAgo: 18,
        fileName: "jerarquia-exposicion-paula.pdf",
        mimeType: "application/pdf",
      },
    ],
  },
];

const demoEmails = patientBlueprints.map((patient) => patient.email);

function buildPatients(psychologistId: string) {
  return patientBlueprints.map((patient) => ({
    id: demoUuid(10000000, patient.code),
    psychologistId,
    firstName: patient.firstName,
    lastName: patient.lastName,
    phoneNumber: patient.phoneNumber,
    email: patient.email,
    birthDate: patient.birthDate,
  }));
}

function buildCaseFiles() {
  return patientBlueprints
    .filter((patient) => patient.diagnosis && patient.treatmentPlan)
    .map((patient) => ({
      id: demoUuid(20000000, patient.code),
      patientId: demoUuid(10000000, patient.code),
      diagnosis: patient.diagnosis!,
      treatmentPlan: patient.treatmentPlan!,
    }));
}

function buildSessionNotes(psychologistId: string) {
  return patientBlueprints.flatMap((patient) =>
    (patient.sessionNotes ?? []).map((note, index) => ({
      id: demoUuid(30000000 + patient.code, index + 1),
      caseFileId: demoUuid(20000000, patient.code),
      authorId: psychologistId,
      sessionDate: dateFromNow(-note.daysAgo, note.hour, note.minute),
      title: note.title,
      content: note.content,
    })),
  );
}

function buildDocuments(psychologistId: string) {
  return patientBlueprints.flatMap((patient) =>
    (patient.documents ?? []).map((document, index) => ({
      id: demoUuid(40000000 + patient.code, index + 1),
      caseFileId: demoUuid(20000000, patient.code),
      uploadedById: psychologistId,
      fileName: document.fileName,
      filePath: `uploads/patients/${demoUuid(10000000, patient.code)}/${document.fileName}`,
      mimeType: document.mimeType,
      uploadedAt: dateFromNow(-document.daysAgo, 9 + index, 0),
    })),
  );
}

function buildAppointments(psychologistId: string) {
  return patientBlueprints.flatMap((patient) =>
    patient.appointments.map((appointment, index) => ({
      id: demoUuid(50000000 + patient.code, index + 1),
      patientId: demoUuid(10000000, patient.code),
      psychologistId,
      scheduledAt: dateFromNow(
        appointment.daysFromNow,
        appointment.hour,
        appointment.minute,
      ),
      durationMinutes: appointment.durationMinutes,
      status: appointment.status,
      notes: appointment.notes,
      patientCode: patient.code,
      patientName: `${patient.firstName} ${patient.lastName}`,
      fee: appointment.fee ?? null,
      paymentMethod: appointment.paymentMethod ?? null,
      createPendingCharge: appointment.createPendingCharge ?? false,
    })),
  );
}

function buildFinancialTransactions(psychologistId: string) {
  const appointments = buildAppointments(psychologistId);

  const appointmentTransactions: DemoFinancialTransaction[] = [];

  appointments.forEach((appointment, index) => {
    if (appointment.status === AppointmentStatus.COMPLETED && appointment.fee) {
      appointmentTransactions.push({
        id: demoUuid(60000000, index + 1),
        type: FinancialTransactionType.INCOME,
        status: FinancialTransactionStatus.COMPLETED,
        category: FinancialTransactionCategory.SESSION,
        amount: appointment.fee,
        currency: "MXN",
        concept: `Pago de sesion - ${appointment.patientName}`,
        description: `${DEMO_TAG} Ingreso registrado por sesion completada.`,
        occurredAt: addMinutes(
          appointment.scheduledAt,
          appointment.durationMinutes,
        ),
        dueDate: null,
        paymentMethod: appointment.paymentMethod,
        notes: `${DEMO_TAG} Sesion vinculada a cita completada.`,
        patientId: appointment.patientId,
        appointmentId: appointment.id,
        createdById: psychologistId,
      });
      return;
    }

    if (
      appointment.status === AppointmentStatus.SCHEDULED &&
      appointment.fee &&
      appointment.createPendingCharge
    ) {
      appointmentTransactions.push({
        id: demoUuid(61000000, index + 1),
        type: FinancialTransactionType.INCOME,
        status: FinancialTransactionStatus.PENDING,
        category: FinancialTransactionCategory.SESSION,
        amount: appointment.fee,
        currency: "MXN",
        concept: `Cobro pendiente - ${appointment.patientName}`,
        description: `${DEMO_TAG} Cargo pendiente para sesion programada.`,
        occurredAt: appointment.scheduledAt,
        dueDate: appointment.scheduledAt,
        paymentMethod: null,
        notes: `${DEMO_TAG} Pendiente de cobro para cita futura.`,
        patientId: appointment.patientId,
        appointmentId: appointment.id,
        createdById: psychologistId,
      });
    }
  });

  const operationalTransactions: DemoFinancialTransaction[] = [
    {
      id: demoUuid(62000000, 1),
      type: FinancialTransactionType.EXPENSE,
      status: FinancialTransactionStatus.COMPLETED,
      category: FinancialTransactionCategory.RENT,
      amount: 8500,
      currency: "MXN",
      concept: "Renta del consultorio",
      description: `${DEMO_TAG} Renta mensual del espacio de consulta.`,
      occurredAt: dateFromNow(-25, 8, 0),
      dueDate: null,
      paymentMethod: PaymentMethod.TRANSFER,
      notes: `${DEMO_TAG} Gasto operativo mensual.`,
      patientId: null,
      appointmentId: null,
      createdById: psychologistId,
    },
    {
      id: demoUuid(62000000, 2),
      type: FinancialTransactionType.EXPENSE,
      status: FinancialTransactionStatus.PENDING,
      category: FinancialTransactionCategory.RENT,
      amount: 8500,
      currency: "MXN",
      concept: "Renta del consultorio",
      description: `${DEMO_TAG} Renta mensual del espacio de consulta.`,
      occurredAt: dateFromNow(5, 8, 0),
      dueDate: dateFromNow(5, 18, 0),
      paymentMethod: null,
      notes: `${DEMO_TAG} Gasto operativo pendiente del mes actual.`,
      patientId: null,
      appointmentId: null,
      createdById: psychologistId,
    },
    {
      id: demoUuid(62000000, 3),
      type: FinancialTransactionType.EXPENSE,
      status: FinancialTransactionStatus.COMPLETED,
      category: FinancialTransactionCategory.SOFTWARE,
      amount: 349,
      currency: "MXN",
      concept: "Suscripcion de videollamadas",
      description: `${DEMO_TAG} Herramienta para sesiones remotas y seguimiento.`,
      occurredAt: dateFromNow(-19, 7, 30),
      dueDate: null,
      paymentMethod: PaymentMethod.CARD,
      notes: `${DEMO_TAG} Software mensual.`,
      patientId: null,
      appointmentId: null,
      createdById: psychologistId,
    },
    {
      id: demoUuid(62000000, 4),
      type: FinancialTransactionType.EXPENSE,
      status: FinancialTransactionStatus.COMPLETED,
      category: FinancialTransactionCategory.SOFTWARE,
      amount: 229,
      currency: "MXN",
      concept: "Suscripcion de agenda clinica",
      description: `${DEMO_TAG} Herramienta de gestion administrativa.`,
      occurredAt: dateFromNow(-4, 7, 45),
      dueDate: null,
      paymentMethod: PaymentMethod.CARD,
      notes: `${DEMO_TAG} Software de apoyo operativo.`,
      patientId: null,
      appointmentId: null,
      createdById: psychologistId,
    },
    {
      id: demoUuid(62000000, 5),
      type: FinancialTransactionType.EXPENSE,
      status: FinancialTransactionStatus.COMPLETED,
      category: FinancialTransactionCategory.UTILITIES,
      amount: 1180,
      currency: "MXN",
      concept: "Internet y servicios",
      description: `${DEMO_TAG} Pago de internet y energia del consultorio.`,
      occurredAt: dateFromNow(-12, 9, 15),
      dueDate: null,
      paymentMethod: PaymentMethod.TRANSFER,
      notes: `${DEMO_TAG} Gasto operativo recurrente.`,
      patientId: null,
      appointmentId: null,
      createdById: psychologistId,
    },
    {
      id: demoUuid(62000000, 6),
      type: FinancialTransactionType.EXPENSE,
      status: FinancialTransactionStatus.PENDING,
      category: FinancialTransactionCategory.SUPPLIES,
      amount: 540,
      currency: "MXN",
      concept: "Material de oficina y papeleria",
      description: `${DEMO_TAG} Compra pendiente de hojas, carpetas y material impreso.`,
      occurredAt: dateFromNow(3, 13, 0),
      dueDate: dateFromNow(6, 18, 0),
      paymentMethod: null,
      notes: `${DEMO_TAG} Gasto pendiente por surtir.`,
      patientId: null,
      appointmentId: null,
      createdById: psychologistId,
    },
    {
      id: demoUuid(62000000, 7),
      type: FinancialTransactionType.ADJUSTMENT,
      status: FinancialTransactionStatus.COMPLETED,
      category: FinancialTransactionCategory.MANUAL,
      amount: 300,
      currency: "MXN",
      concept: "Ajuste por redondeo de caja",
      description: `${DEMO_TAG} Ajuste administrativo menor para cuadrar ingresos en efectivo.`,
      occurredAt: dateFromNow(-2, 20, 0),
      dueDate: null,
      paymentMethod: PaymentMethod.CASH,
      notes: `${DEMO_TAG} Ajuste manual.`,
      patientId: null,
      appointmentId: null,
      createdById: psychologistId,
    },
    {
      id: demoUuid(62000000, 8),
      type: FinancialTransactionType.REFUND,
      status: FinancialTransactionStatus.COMPLETED,
      category: FinancialTransactionCategory.SESSION,
      amount: 400,
      currency: "MXN",
      concept: "Reembolso parcial por reprogramacion",
      description: `${DEMO_TAG} Reembolso parcial por cambio de horario solicitado con anticipacion.`,
      occurredAt: dateFromNow(-8, 12, 15),
      dueDate: null,
      paymentMethod: PaymentMethod.TRANSFER,
      notes: `${DEMO_TAG} Reembolso administrativo.`,
      patientId: demoUuid(10000000, 5),
      appointmentId: null,
      createdById: psychologistId,
    },
  ];

  return [...appointmentTransactions, ...operationalTransactions];
}

async function upsertUser(params: {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
}) {
  return prisma.user.upsert({
    where: { email: params.email },
    update: {
      name: params.name,
      passwordHash: params.passwordHash,
      role: params.role,
    },
    create: {
      id: params.id,
      name: params.name,
      email: params.email,
      passwordHash: params.passwordHash,
      role: params.role,
    },
    select: {
      id: true,
      email: true,
    },
  });
}

async function resetDemoClinicalData() {
  const demoPatients = await prisma.patient.findMany({
    where: {
      email: {
        in: demoEmails,
      },
    },
    select: {
      id: true,
      caseFile: {
        select: {
          id: true,
        },
      },
      appointments: {
        select: {
          id: true,
        },
      },
    },
  });

  const demoPatientIds = demoPatients.map((patient) => patient.id);
  const demoCaseFileIds = demoPatients
    .map((patient) => patient.caseFile?.id)
    .filter((id): id is string => Boolean(id));
  const demoAppointmentIds = demoPatients.flatMap((patient) =>
    patient.appointments.map((appointment) => appointment.id),
  );

  await prisma.$transaction([
    prisma.financialTransaction.deleteMany({
      where: {
        OR: [
          { patientId: { in: demoPatientIds } },
          { appointmentId: { in: demoAppointmentIds } },
          { notes: { contains: DEMO_TAG } },
          { description: { contains: DEMO_TAG } },
        ],
      },
    }),
    prisma.document.deleteMany({
      where: { caseFileId: { in: demoCaseFileIds } },
    }),
    prisma.sessionNote.deleteMany({
      where: { caseFileId: { in: demoCaseFileIds } },
    }),
    prisma.appointment.deleteMany({
      where: { id: { in: demoAppointmentIds } },
    }),
    prisma.caseFile.deleteMany({
      where: { id: { in: demoCaseFileIds } },
    }),
    prisma.patient.deleteMany({
      where: { id: { in: demoPatientIds } },
    }),
  ]);
}

function countFinancialTransactionsBy<K extends string>(
  transactions: DemoFinancialTransaction[],
  getKey: (transaction: DemoFinancialTransaction) => K,
) {
  return transactions.reduce(
    (accumulator, transaction) => {
      const key = getKey(transaction);
      accumulator[key] = (accumulator[key] ?? 0) + 1;
      return accumulator;
    },
    {} as Record<K, number>,
  );
}

function summarizeFinancialTransactions(
  transactions: DemoFinancialTransaction[],
) {
  return {
    total: transactions.length,
    byType: countFinancialTransactionsBy(transactions, (transaction) =>
      String(transaction.type),
    ),
    byStatus: countFinancialTransactionsBy(transactions, (transaction) =>
      String(transaction.status),
    ),
    byCategory: countFinancialTransactionsBy(transactions, (transaction) =>
      String(transaction.category),
    ),
  };
}

async function seedDemoClinicalData(psychologistId: string) {
  const patients = buildPatients(psychologistId);
  const caseFiles = buildCaseFiles();
  const sessionNotes = buildSessionNotes(psychologistId);
  const documents = buildDocuments(psychologistId);
  const appointments = buildAppointments(psychologistId).map(
    ({
      patientCode,
      patientName,
      fee,
      paymentMethod,
      createPendingCharge,
      ...appointment
    }) => appointment,
  );
  const financialTransactions = buildFinancialTransactions(psychologistId);

  const [
    patientsInsert,
    caseFilesInsert,
    sessionNotesInsert,
    documentsInsert,
    appointmentsInsert,
    financialTransactionsInsert,
  ] = await prisma.$transaction([
    prisma.patient.createMany({ data: patients }),
    prisma.caseFile.createMany({ data: caseFiles }),
    prisma.sessionNote.createMany({ data: sessionNotes }),
    prisma.document.createMany({ data: documents }),
    prisma.appointment.createMany({ data: appointments }),
    prisma.financialTransaction.createMany({ data: financialTransactions }),
  ]);

  const financialTransactionsSummary = summarizeFinancialTransactions(
    financialTransactions,
  );

  const appointmentDates = appointments.map(
    (appointment) => appointment.scheduledAt,
  );
  const scheduledAppointments = appointments.filter(
    (appointment) => appointment.status === AppointmentStatus.SCHEDULED,
  );

  return {
    patients: patients.length,
    caseFiles: caseFiles.length,
    sessionNotes: sessionNotes.length,
    documents: documents.length,
    appointments: appointments.length,
    scheduledAppointments: scheduledAppointments.length,
    financialTransactions: financialTransactions.length,
    financialTransactionsInserted: financialTransactionsInsert.count,
    financialTransactionsByType: financialTransactionsSummary.byType,
    financialTransactionsByStatus: financialTransactionsSummary.byStatus,
    financialTransactionsByCategory: financialTransactionsSummary.byCategory,
    insertedRows: {
      patients: patientsInsert.count,
      caseFiles: caseFilesInsert.count,
      sessionNotes: sessionNotesInsert.count,
      documents: documentsInsert.count,
      appointments: appointmentsInsert.count,
      financialTransactions: financialTransactionsInsert.count,
    },
    firstAppointmentDate: new Date(
      Math.min(...appointmentDates.map((date) => date.getTime())),
    ),
    lastAppointmentDate: new Date(
      Math.max(...appointmentDates.map((date) => date.getTime())),
    ),
  };
}

async function main() {
  const defaultPasswordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  const admin = await upsertUser({
    id: ADMIN_USER_ID,
    name: "Enrique Felix",
    email: "admin@psychology-app.local",
    passwordHash: defaultPasswordHash,
    role: UserRole.ADMIN,
  });

  const psychologist = await upsertUser({
    id: PSYCHOLOGIST_USER_ID,
    name: "Demo Psychologist",
    email: "psychologist@psychology-app.local",
    passwordHash: defaultPasswordHash,
    role: UserRole.PSYCHOLOGIST,
  });

  await resetDemoClinicalData();
  const seedSummary = await seedDemoClinicalData(psychologist.id);

  console.log("Seed completed successfully.");
  console.log(`Demo password: ${DEFAULT_PASSWORD}`);
  console.log(`Admin user: ${admin.email}`);
  console.log(`Psychologist user: ${psychologist.email}`);
  console.log(`Patients seeded: ${seedSummary.patients}`);
  console.log(`Case files seeded: ${seedSummary.caseFiles}`);
  console.log(`Session notes seeded: ${seedSummary.sessionNotes}`);
  console.log(`Documents seeded: ${seedSummary.documents}`);
  console.log(`Appointments seeded: ${seedSummary.appointments}`);
  console.log(
    `Scheduled appointments seeded: ${seedSummary.scheduledAppointments}`,
  );
  console.log(
    `Financial transactions built: ${seedSummary.financialTransactions}`,
  );
  console.log(
    `Financial transactions inserted: ${seedSummary.financialTransactionsInserted}`,
  );
  console.log(
    `Financial transactions by type: ${JSON.stringify(seedSummary.financialTransactionsByType)}`,
  );
  console.log(
    `Financial transactions by status: ${JSON.stringify(seedSummary.financialTransactionsByStatus)}`,
  );
  console.log(
    `Financial transactions by category: ${JSON.stringify(seedSummary.financialTransactionsByCategory)}`,
  );
  console.log(`Date reference used: ${now.toISOString()}`);
  console.log(
    `Appointment date range: ${seedSummary.firstAppointmentDate.toISOString()} - ${seedSummary.lastAppointmentDate.toISOString()}`,
  );
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

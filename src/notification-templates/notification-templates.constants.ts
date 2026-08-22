import { NotificationChannel, NotificationEventType } from '@prisma/client';

export interface TemplateVariableMetadata {
  key: string;
  label: string;
  description: string;
  exampleValue: string;
  category: 'patient' | 'therapist' | 'appointment' | 'organization' | 'general';
}

export const CANONICAL_TEMPLATE_VARIABLES: readonly TemplateVariableMetadata[] = [
  {
    key: 'patientName',
    label: 'Nombre del Paciente',
    description: 'Nombre completo o de pila del paciente citado',
    exampleValue: 'Ana Sofía Rodríguez',
    category: 'patient',
  },
  {
    key: 'therapistName',
    label: 'Nombre del Terapeuta',
    description: 'Nombre del profesional que atenderá la sesión',
    exampleValue: 'Dr. Carlos Mendoza',
    category: 'therapist',
  },
  {
    key: 'appointmentDate',
    label: 'Fecha de la Cita',
    description: 'Fecha programada de la consulta',
    exampleValue: '25 de Agosto de 2026',
    category: 'appointment',
  },
  {
    key: 'appointmentTime',
    label: 'Hora de la Cita',
    description: 'Horario fijado para el inicio de la cita',
    exampleValue: '10:00 AM',
    category: 'appointment',
  },
  {
    key: 'organizationName',
    label: 'Nombre de la Organización',
    description: 'Nombre o razón social de la clínica / centro',
    exampleValue: 'PsiqueOS Clínica Central',
    category: 'organization',
  },
  {
    key: 'branchName',
    label: 'Sede / Sucursal',
    description: 'Nombre de la sede donde tendrá lugar la atención presencial',
    exampleValue: 'Sede Providencia',
    category: 'organization',
  },
  {
    key: 'locationOrLink',
    label: 'Ubicación o Enlace Virtual',
    description: 'Dirección física del consultorio o URL de videoconsulta',
    exampleValue: 'Av. Las Palmas 340, Consultorio 4B / https://meet.psiqueos.com/session-xyz',
    category: 'appointment',
  },
  {
    key: 'rescheduleLink',
    label: 'Enlace de Gestión / Reagendamiento',
    description: 'Enlace seguro para confirmar o solicitar cambio de horario',
    exampleValue: 'https://citas.psiqueos.com/reagendar/tok_89a3f4',
    category: 'general',
  },
  {
    key: 'cancellationReason',
    label: 'Motivo de Cancelación',
    description: 'Justificación médica, clínica u operativa de cancelación',
    exampleValue: 'Reprogramación por fuerza mayor del profesional',
    category: 'general',
  },
  {
    key: 'organizationPhone',
    label: 'Teléfono de Contacto',
    description: 'Número telefónico o de WhatsApp de atención al paciente',
    exampleValue: '+52 55 1234 5678',
    category: 'organization',
  },
  {
    key: 'organizationEmail',
    label: 'Correo de la Organización',
    description: 'Correo electrónico institucional de contacto',
    exampleValue: 'contacto@psiqueos.com',
    category: 'organization',
  },
];

export interface DefaultTemplateDefinition {
  channel: NotificationChannel;
  eventType: NotificationEventType;
  name: string;
  subject?: string;
  body: string;
  variables: string[];
}

export const DEFAULT_NOTIFICATION_TEMPLATES: readonly DefaultTemplateDefinition[] = [
  // 1. APPOINTMENT_CONFIRMATION
  {
    channel: NotificationChannel.EMAIL,
    eventType: NotificationEventType.APPOINTMENT_CONFIRMATION,
    name: 'Confirmación de Cita (Email)',
    subject: 'Confirmación de tu cita en {{organizationName}}',
    body: `Estimado/a {{patientName}},\n\nTu cita con {{therapistName}} ha sido agendada exitosamente.\n\n📅 Fecha: {{appointmentDate}}\n⏰ Hora: {{appointmentTime}}\n📍 Ubicación: {{locationOrLink}}\n🏢 Sede: {{branchName}}\n\nSi necesitas realizar algún cambio o reagendar, puedes hacerlo en el siguiente enlace:\n{{rescheduleLink}}\n\nAtentamente,\n{{organizationName}}\n📞 {{organizationPhone}} | ✉️ {{organizationEmail}}`,
    variables: ['patientName', 'therapistName', 'appointmentDate', 'appointmentTime', 'locationOrLink', 'branchName', 'rescheduleLink', 'organizationName', 'organizationPhone', 'organizationEmail'],
  },
  {
    channel: NotificationChannel.WHATSAPP,
    eventType: NotificationEventType.APPOINTMENT_CONFIRMATION,
    name: 'Confirmación de Cita (WhatsApp)',
    body: `Hola *{{patientName}}*, tu cita en *{{organizationName}}* ha sido confirmada con éxito ✅\n\n👨‍⚕️ *Especialista:* {{therapistName}}\n📅 *Fecha:* {{appointmentDate}}\n⏰ *Hora:* {{appointmentTime}}\n📍 *Lugar / Link:* {{locationOrLink}}\n\nPara gestionar o reagendar tu turno ingresa aquí: {{rescheduleLink}}\n\n_¡Te esperamos!_`,
    variables: ['patientName', 'organizationName', 'therapistName', 'appointmentDate', 'appointmentTime', 'locationOrLink', 'rescheduleLink'],
  },
  {
    channel: NotificationChannel.SMS,
    eventType: NotificationEventType.APPOINTMENT_CONFIRMATION,
    name: 'Confirmación de Cita (SMS)',
    body: `{{organizationName}}: Hola {{patientName}}, tu cita con {{therapistName}} es el {{appointmentDate}} a las {{appointmentTime}}. Info: {{locationOrLink}}. Reagendar: {{rescheduleLink}}`,
    variables: ['organizationName', 'patientName', 'therapistName', 'appointmentDate', 'appointmentTime', 'locationOrLink', 'rescheduleLink'],
  },

  // 2. APPOINTMENT_REMINDER_24H
  {
    channel: NotificationChannel.EMAIL,
    eventType: NotificationEventType.APPOINTMENT_REMINDER_24H,
    name: 'Recordatorio 24 Horas (Email)',
    subject: 'Recordatorio: Tu cita de mañana en {{organizationName}}',
    body: `Hola {{patientName}},\n\nTe recordamos que tienes una cita programada para el día de mañana con {{therapistName}}.\n\n📅 Fecha: {{appointmentDate}}\n⏰ Hora: {{appointmentTime}}\n📍 Ubicación / Enlace: {{locationOrLink}}\n\nPor favor, llega con 5-10 minutos de anticipación. Si no puedes asistir, notifícanos o reagenda aquí: {{rescheduleLink}}\n\nSaludos cordiales,\n{{organizationName}}`,
    variables: ['patientName', 'therapistName', 'appointmentDate', 'appointmentTime', 'locationOrLink', 'rescheduleLink', 'organizationName'],
  },
  {
    channel: NotificationChannel.WHATSAPP,
    eventType: NotificationEventType.APPOINTMENT_REMINDER_24H,
    name: 'Recordatorio 24 Horas (WhatsApp)',
    body: `Hola *{{patientName}}*, te recordamos que *mañana* tienes tu sesión en *{{organizationName}}* 🔔\n\n👨‍⚕️ *Profesional:* {{therapistName}}\n📅 *Fecha:* {{appointmentDate}}\n⏰ *Hora:* {{appointmentTime}}\n📍 *Ubicación / Link:* {{locationOrLink}}\n\nSi necesitas modificar tu cita, haz clic aquí: {{rescheduleLink}}\n\n_¡Que tengas excelente día!_`,
    variables: ['patientName', 'organizationName', 'therapistName', 'appointmentDate', 'appointmentTime', 'locationOrLink', 'rescheduleLink'],
  },
  {
    channel: NotificationChannel.SMS,
    eventType: NotificationEventType.APPOINTMENT_REMINDER_24H,
    name: 'Recordatorio 24 Horas (SMS)',
    body: `{{organizationName}}: Recordatorio de tu cita manana {{appointmentDate}} a las {{appointmentTime}} con {{therapistName}}. Lugar: {{locationOrLink}}`,
    variables: ['organizationName', 'patientName', 'appointmentDate', 'appointmentTime', 'therapistName', 'locationOrLink'],
  },

  // 3. APPOINTMENT_REMINDER_2H
  {
    channel: NotificationChannel.EMAIL,
    eventType: NotificationEventType.APPOINTMENT_REMINDER_2H,
    name: 'Recordatorio 2 Horas (Email)',
    subject: 'Tu cita en {{organizationName}} comienza en 2 horas',
    body: `Hola {{patientName}},\n\nTu sesión con {{therapistName}} iniciará en aproximadamente 2 horas.\n\n⏰ Hora de inicio: {{appointmentTime}}\n📍 Enlace / Consultorio: {{locationOrLink}}\n\nTe esperamos puntualmente.\n{{organizationName}}`,
    variables: ['patientName', 'therapistName', 'appointmentTime', 'locationOrLink', 'organizationName'],
  },
  {
    channel: NotificationChannel.WHATSAPP,
    eventType: NotificationEventType.APPOINTMENT_REMINDER_2H,
    name: 'Recordatorio 2 Horas (WhatsApp)',
    body: `*{{patientName}}*, tu sesión en *{{organizationName}}* comienza en *2 horas* ⏳\n\n⏰ *Hora:* {{appointmentTime}}\n👨‍⚕️ *Especialista:* {{therapistName}}\n📍 *Acceso:* {{locationOrLink}}\n\n_Por favor conéctate o llega con 5 minutos de anticipación._`,
    variables: ['patientName', 'organizationName', 'appointmentTime', 'therapistName', 'locationOrLink'],
  },
  {
    channel: NotificationChannel.SMS,
    eventType: NotificationEventType.APPOINTMENT_REMINDER_2H,
    name: 'Recordatorio 2 Horas (SMS)',
    body: `{{organizationName}}: Tu cita con {{therapistName}} comienza en 2 horas ({{appointmentTime}}). Acceso: {{locationOrLink}}`,
    variables: ['organizationName', 'therapistName', 'appointmentTime', 'locationOrLink'],
  },

  // 4. APPOINTMENT_RESCHEDULED
  {
    channel: NotificationChannel.EMAIL,
    eventType: NotificationEventType.APPOINTMENT_RESCHEDULED,
    name: 'Cita Reprogramada (Email)',
    subject: 'Actualización: Tu cita en {{organizationName}} ha sido reprogramada',
    body: `Hola {{patientName}},\n\nTe informamos que tu cita con {{therapistName}} ha sido modificada con un nuevo horario:\n\n📅 Nueva Fecha: {{appointmentDate}}\n⏰ Nueva Hora: {{appointmentTime}}\n📍 Ubicación / Enlace: {{locationOrLink}}\n\nPuedes consultar o gestionar tus citas aquí: {{rescheduleLink}}\n\nSaludos,\n{{organizationName}}`,
    variables: ['patientName', 'therapistName', 'appointmentDate', 'appointmentTime', 'locationOrLink', 'rescheduleLink', 'organizationName'],
  },
  {
    channel: NotificationChannel.WHATSAPP,
    eventType: NotificationEventType.APPOINTMENT_RESCHEDULED,
    name: 'Cita Reprogramada (WhatsApp)',
    body: `Hola *{{patientName}}*, tu cita en *{{organizationName}}* ha sido *reprogramada* 🔄\n\n👨‍⚕️ *Especialista:* {{therapistName}}\n📅 *Nueva Fecha:* {{appointmentDate}}\n⏰ *Nuevo Horario:* {{appointmentTime}}\n📍 *Lugar / Link:* {{locationOrLink}}\n\nSi necesitas soporte o un cambio adicional: {{rescheduleLink}}`,
    variables: ['patientName', 'organizationName', 'therapistName', 'appointmentDate', 'appointmentTime', 'locationOrLink', 'rescheduleLink'],
  },
  {
    channel: NotificationChannel.SMS,
    eventType: NotificationEventType.APPOINTMENT_RESCHEDULED,
    name: 'Cita Reprogramada (SMS)',
    body: `{{organizationName}}: Tu cita con {{therapistName}} ha sido reprogramada para el {{appointmentDate}} a las {{appointmentTime}}. Lugar: {{locationOrLink}}`,
    variables: ['organizationName', 'therapistName', 'appointmentDate', 'appointmentTime', 'locationOrLink'],
  },

  // 5. APPOINTMENT_CANCELLED
  {
    channel: NotificationChannel.EMAIL,
    eventType: NotificationEventType.APPOINTMENT_CANCELLED,
    name: 'Cancelación de Cita (Email)',
    subject: 'Notificación de Cancelación - {{organizationName}}',
    body: `Estimado/a {{patientName}},\n\nLamentamos informarte que tu cita programada para el {{appointmentDate}} a las {{appointmentTime}} con {{therapistName}} ha sido cancelada.\n\nMotivo: {{cancellationReason}}\n\nPara agendar una nueva cita, puedes ingresar a: {{rescheduleLink}} o comunicarte con nosotros al {{organizationPhone}}.\n\nAtentamente,\n{{organizationName}}`,
    variables: ['patientName', 'appointmentDate', 'appointmentTime', 'therapistName', 'cancellationReason', 'rescheduleLink', 'organizationPhone', 'organizationName'],
  },
  {
    channel: NotificationChannel.WHATSAPP,
    eventType: NotificationEventType.APPOINTMENT_CANCELLED,
    name: 'Cancelación de Cita (WhatsApp)',
    body: `Hola *{{patientName}}*, te notificamos que tu cita del *{{appointmentDate}} {{appointmentTime}}* en *{{organizationName}}* ha sido cancelada ❌\n\n📌 *Motivo:* {{cancellationReason}}\n\nPuedes reagendar tu sesión en: {{rescheduleLink}} o escribirnos para ayudarte.`,
    variables: ['patientName', 'appointmentDate', 'appointmentTime', 'organizationName', 'cancellationReason', 'rescheduleLink'],
  },
  {
    channel: NotificationChannel.SMS,
    eventType: NotificationEventType.APPOINTMENT_CANCELLED,
    name: 'Cancelación de Cita (SMS)',
    body: `{{organizationName}}: Tu cita del {{appointmentDate}} ha sido cancelada. Motivo: {{cancellationReason}}. Reagendar: {{rescheduleLink}}`,
    variables: ['organizationName', 'appointmentDate', 'cancellationReason', 'rescheduleLink'],
  },
];

interface LocalWorkout {
    id: string;
    type: string;
    deviceName?: string;
    startTime: number;
    endTime: number;
    duration: number;
    distance?: number;
    elevationGain?: number;
    calories?: number;
    avgHeartRate?: number;
    maxHeartRate?: number;
    syncedAt?: number;
}
interface WorkoutDetailsProps {
    workout: LocalWorkout | null;
    onClose: () => void;
}
export declare function WorkoutDetails({ workout, onClose }: WorkoutDetailsProps): import("react/jsx-runtime").JSX.Element;
export {};
